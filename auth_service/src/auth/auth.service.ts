import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../config/config.service';
import { AccountsRepository } from '../persistence/accounts.repository';
import { RefreshTokensRepository } from '../persistence/refresh-tokens.repository';
import {
  AuthUser,
  UsersRepository,
  UsernameTakenError,
} from '../persistence/users.repository';
import {
  invalidInput,
  registrationConflict,
  unauthorised,
} from '../common/error-envelope';
import { AccessTokenClaims } from './access-token-claims';
import { LoginRequestDto } from './dto/login-request.dto';
import { RefreshRequestDto } from './dto/refresh-request.dto';
import { RegisterRequestDto } from './dto/register-request.dto';
import { PasswordService } from './password.service';
import { Role } from './role.enum';

export interface UserResponse {
  id: string;
  username: string;
  accountId: number;
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

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly accounts: AccountsRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  // POST /auth/register
  async register(body: RegisterRequestDto): Promise<UserResponse> {
    // Do not create a trading account: `Accounts` belongs to the Sprint 3
    // schema. Verify the supplied id exists (else VAL-422), then record the
    // link on the user's own row - `Accounts` itself is never written.
    if (!(await this.accounts.exists(body.accountId))) {
      throw invalidInput();
    }

    const passwordHash = await this.passwords.hash(body.password);

    try {
      // Whatever `roles` the body declared is ignored: the repository pins
      // every self-registered user to the `client` role.
      const user = await this.users.create({
        name: body.name,
        email: body.username,
        passwordHash,
        accountId: body.accountId,
      });

      return toUserResponse(user);
    } catch (error) {
      if (error instanceof UsernameTakenError) {
        throw registrationConflict();
      }

      throw error;
    }
  }

  // POST /auth/login - `body.username` carries the email address.
  async login(body: LoginRequestDto): Promise<TokenResponse> {
    const user = await this.users.findByEmail(body.username);

    const passwordValid = user
      ? await this.passwords.verify(body.password, user.passwordHash)
      : await this.passwords.verifyAgainstDecoy(body.password);

    // Unknown email and wrong password arrive here together: same status,
    // same body, and the decoy bcrypt run keeps the timing equal too.
    if (!user || !passwordValid) {
      throw unauthorised();
    }

    return this.issueTokenPair(user, randomUUID());
  }

  // POST /auth/refresh - 200 with a token pair, or 401.
  async refresh(body: RefreshRequestDto): Promise<TokenResponse> {
    const presented = await this.refreshTokens.findByHash(
      refreshTokenHash(body.refreshToken),
    );

    if (!presented || presented.expiresAt.getTime() <= Date.now()) {
      throw unauthorised();
    }

    const user = await this.users.findById(presented.userId);
    if (!user) {
      throw unauthorised();
    }

    return this.issueTokenPair(user, presented.familyId);
  }

  // GET /auth/me - the user named by the verified access token.
  async currentUser(claims: AccessTokenClaims): Promise<UserResponse> {
    const user = await this.users.findById(claims.sub);
    const accountId = user?.accountId ?? null;

    if (!user || accountId === null) {
      throw unauthorised();
    }

    return toUserResponse({ ...user, accountId });
  }

  /**
   * Issues the pair the contract's login and refresh bodies carry: the
   * access token (exactly the contract claim set - see signAccessToken) and
   * an opaque refresh token.
   *
   * Signs first: a user with no linked account cannot get a token, and must
   * not leave a half-issued refresh row behind when that refuses.
   */
  private async issueTokenPair(
    user: AuthUser,
    familyId: string,
  ): Promise<TokenResponse> {
    const accessToken = await this.signAccessToken(user);

    const refreshToken = newRefreshToken();
    await this.refreshTokens.insert({
      tokenHash: refreshTokenHash(refreshToken),
      userId: user.id,
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
  private async signAccessToken(user: AuthUser): Promise<string> {
    const accountId = user.accountId;
    if (accountId === null) {
      // No linked trading account, so no integer account claim to carry -
      // a token cannot be honestly minted. Same 401 as bad credentials.
      throw unauthorised();
    }

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

/** An opaque refresh token: random bytes, no claims. */
function newRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

/** The refresh_tokens table is keyed by this hash. */
function refreshTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function toUserResponse(
  user: AuthUser & { accountId: number },
): UserResponse {
  return {
    id: user.id,
    username: user.email,
    accountId: user.accountId,
    roles: user.roles,
    createdOn: user.createdAt.toISOString(),
  };
}
