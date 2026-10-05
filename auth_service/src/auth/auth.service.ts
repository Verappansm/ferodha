import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../config/config.service';
import { AccountsRepository } from '../persistence/accounts.repository';
import { RefreshTokensRepository } from '../persistence/refresh-tokens.repository';
import {
  AuthUser,
  UsersRepository,
  UsernameTakenError,
} from '../persistence/users.repository';
import { registrationConflict, unauthorised } from '../common/error-envelope';
import { AccessTokenClaims } from './access-token-claims';
import { LoginRequestDto } from './dto/login-request.dto';
import { RefreshRequestDto } from './dto/refresh-request.dto';
import { RegisterRequestDto } from './dto/register-request.dto';
import { PasswordService } from './password.service';
import { Role } from './role.enum';

export interface UserResponse {
  id: string;
  username: string;
  /** Absent until a trading account has been opened for the user. */
  accountId?: number;
  roles: Role[];
  createdOn: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Refresh tokens live 7 days - the lifetime the contract states. */
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const JWT_ISSUER = 'auth-service';

/**
 * A user who may hold a session: ACTIVE, and owning a trading account. The
 * account is what the token's accountId claim carries, so without one there
 * is nothing honest to sign.
 */
interface SessionUser {
  user: AuthUser;
  accountId: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly accounts: AccountsRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * POST /auth/register. Creates the user and a PENDING account-opening
   * request. The trading account is opened only when an admin approves that
   * request, and until then the user cannot log in, so registration never
   * returns an accountId and never issues a token.
   */
  async register(body: RegisterRequestDto): Promise<UserResponse> {
    const passwordHash = await this.passwords.hash(body.password);

    try {
      // Whatever `roles` the body declared is ignored: the repository pins
      // every self-registered user to the `client` role.
      const user = await this.users.createWithAccountRequest({
        name: body.name ?? body.username.split('@')[0],
        email: body.username,
        passwordHash,
      });
      this.logger.log(`User registered: ${user.id}`);
      return toUserResponse(user, null);
    } catch (error) {
      if (error instanceof UsernameTakenError) {
        this.logger.warn('Registration refused: username already taken');
        throw registrationConflict();
      }
      throw error;
    }
  }

  /**
   * POST /auth/login - `body.username` carries the email address, already
   * lower-cased by the DTO.
   *
   * The password is checked before anything else about the user, and an
   * unknown email runs the decoy comparison, so every failure costs one
   * bcrypt run whatever caused it. Status and account are only looked at once
   * the password is known to be right.
   */
  async login(body: LoginRequestDto): Promise<TokenResponse> {
    const user = await this.users.findByEmail(body.username);

    const passwordValid = user
      ? await this.passwords.verify(body.password, user.passwordHash)
      : await this.passwords.verifyAgainstDecoy(body.password);

    if (!user || !passwordValid) {
      this.logger.warn(
        user
          ? `Login failed: wrong password for user ${user.id}`
          : 'Login failed: unknown username',
      );
      throw unauthorised();
    }

    const session = await this.sessionFor(user);
    if (!session) {
      throw unauthorised();
    }

    this.logger.log(`Login succeeded: user ${user.id}`);
    // A fresh login starts a new refresh-token chain (its family).
    return this.issueTokenPair(session, randomUUID());
  }

  /**
   * POST /auth/refresh - rotation with reuse detection.
   *
   * Every refresh token is single-use. Exchanging one spends it and issues
   * a replacement in the same family. A spent or revoked token coming back
   * means two parties hold the same chain - the legitimate client and
   * whoever copied its token - and the service cannot tell which is which,
   * so the whole family is revoked and both must log in again. The user's
   * other families (other devices) are left alone; see LEAP-005.
   */
  async refresh(body: RefreshRequestDto): Promise<TokenResponse> {
    const tokenHash = refreshTokenHash(body.refreshToken);
    const presented = await this.refreshTokens.findByHash(tokenHash);

    if (!presented) {
      throw unauthorised();
    }

    // Already exchanged, or already revoked: reuse, treated as theft.
    if (presented.usedAt !== null || presented.revokedAt !== null) {
      await this.refreshTokens.revokeFamily(presented.familyId);
      this.logger.warn(
        `Refresh token reuse: family ${presented.familyId} of user ${presented.userId} revoked`,
      );
      throw unauthorised();
    }

    if (presented.expiresAt.getTime() <= Date.now()) {
      throw unauthorised();
    }

    // Spend it. False means a concurrent request spent it a moment ago -
    // the same reuse signal, the same response.
    const claimed = await this.refreshTokens.markUsed(tokenHash);
    if (!claimed) {
      await this.refreshTokens.revokeFamily(presented.familyId);
      this.logger.warn(
        `Refresh token reuse (concurrent): family ${presented.familyId} of user ${presented.userId} revoked`,
      );
      throw unauthorised();
    }

    // A user suspended, closed or left without an account since the last
    // refresh loses the chain here rather than at its 7-day expiry.
    const user = await this.users.findById(presented.userId);
    const session = user ? await this.sessionFor(user) : null;
    if (!session) {
      await this.refreshTokens.revokeFamily(presented.familyId);
      throw unauthorised();
    }

    // The replacement joins the same chain: one login, one family.
    return this.issueTokenPair(session, presented.familyId);
  }

  /** GET /auth/me - the user named by the verified access token. */
  async currentUser(claims: AccessTokenClaims): Promise<UserResponse> {
    const user = await this.users.findById(claims.sub);
    const session = user ? await this.sessionFor(user) : null;
    if (!session) {
      throw unauthorised();
    }
    return toUserResponse(session.user, session.accountId);
  }

  /**
   * Null unless the user may hold a session right now. Only reached after
   * the password (or a token) has proved who the caller is, so the reason is
   * logged here and never returned.
   */
  private async sessionFor(user: AuthUser): Promise<SessionUser | null> {
    if (user.status !== 'ACTIVE') {
      this.logger.warn(`Session refused: user ${user.id} is ${user.status}`);
      return null;
    }
    // Administrators sign in to the operations console (/auth/admin/login),
    // never here: one sign-in never yields both kinds of token.
    if (user.roles.includes(Role.ADMIN)) {
      this.logger.warn(`Session refused: user ${user.id} is an administrator`);
      return null;
    }
    const accountId = await this.accounts.findAccountIdForUser(user.id);
    if (accountId === null) {
      this.logger.warn(`Session refused: user ${user.id} has no account yet`);
      return null;
    }
    return { user, accountId };
  }

  /**
   * Issues the pair the contract's login and refresh bodies carry: the
   * access token (exactly the contract claim set - see signAccessToken) and
   * an opaque refresh token whose SHA-256 hash is stored in its family.
   */
  private async issueTokenPair(
    session: SessionUser,
    familyId: string,
  ): Promise<TokenResponse> {
    const accessToken = await this.signAccessToken(session);

    const refreshToken = newRefreshToken();
    await this.refreshTokens.insert({
      tokenHash: refreshTokenHash(refreshToken),
      userId: session.user.id,
      familyId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  /**
   * The access token, and nothing else in it.
   *
   * Exactly the contract claim set - sub, accountId, roles, iss - plus the
   * generated iat/exp. No username, no email: the payload is base64, not
   * encryption, and an address in it would be published to every holder of
   * the token.
   */
  private signAccessToken({ user, accountId }: SessionUser): Promise<string> {
    return this.jwt.signAsync(
      {
        sub: user.id,
        accountId,
        roles: user.roles,
        iss: JWT_ISSUER,
      } satisfies Omit<AccessTokenClaims, 'iat' | 'exp'>,
      {
        secret: this.config.jwtSecret,
        algorithm: 'HS256',
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );
  }
}

/** An opaque refresh token: 384 random bits, no claims. */
function newRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

/** The only form of a refresh token this service ever stores. */
function refreshTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function toUserResponse(
  user: AuthUser,
  accountId: number | null,
): UserResponse {
  return {
    id: user.id,
    username: user.email,
    ...(accountId === null ? {} : { accountId }),
    roles: user.roles,
    createdOn: user.createdAt.toISOString(),
  };
}
