import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JWT_ISSUER } from '../auth/auth.service';
import { PasswordService } from '../auth/password.service';
import {
  adminConflict,
  adminNotFound,
  unauthorised,
} from '../common/error-envelope';
import { AppConfigService } from '../config/config.service';
import { ADMIN_AUDIENCE, ADMIN_ROLE } from './admin-jwt.guard';
import {
  AdminUser,
  AdminUsersRepository,
  ChangeResult,
  UserFilter,
} from './admin-users.repository';

const ADMIN_TOKEN_TTL_SECONDS = 15 * 60;

export interface AdminTokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface AdminProfile {
  id: string;
  name: string;
  email: string;
}

/**
 * Admin sign-in and user management (contracts/admin-auth-api.yaml).
 *
 * Admin sign-in follows the customer login's rules: the password is checked
 * first (or the decoy, for an unknown email), every failure is the same
 * AUTH-401, and only then is the user's status looked at.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly users: AdminUsersRepository,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async login(email: string, password: string): Promise<AdminTokenResponse> {
    const admin = await this.users.findAdminByEmail(email);
    const valid = admin
      ? await this.passwords.verify(password, admin.passwordHash)
      : await this.passwords.verifyAgainstDecoy(password);
    if (!admin || !valid || admin.status !== 'ACTIVE') {
      this.logger.warn(
        admin
          ? `Admin login refused for user ${admin.id}`
          : 'Admin login refused: not an admin',
      );
      throw unauthorised();
    }

    await this.users.recordLogin(admin.id);
    this.logger.log(`Admin login: user ${admin.id}`);
    // The contract's admin token: ADMIN role, admin-console audience, no
    // accountId, 15 minutes, and no refresh token.
    const accessToken = await this.jwt.signAsync(
      { sub: admin.id, roles: [ADMIN_ROLE], iss: JWT_ISSUER },
      {
        secret: this.config.jwtSecret,
        algorithm: 'HS256',
        audience: ADMIN_AUDIENCE,
        expiresIn: ADMIN_TOKEN_TTL_SECONDS,
      },
    );
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: ADMIN_TOKEN_TTL_SECONDS,
    };
  }

  async profile(adminId: string): Promise<AdminProfile> {
    const user = await this.users.findById(adminId);
    if (!user || user.role !== 'admin' || user.status !== 'ACTIVE') {
      throw unauthorised();
    }
    return { id: user.id, name: user.name, email: user.email };
  }

  async list(filter: UserFilter, page = 0, size = 25) {
    const { items, total } = await this.users.list(filter, page, size);
    return { items, page, size, totalItems: total };
  }

  suspend(
    adminId: string,
    targetId: string,
    reason: string,
  ): Promise<AdminUser> {
    return this.change(adminId, targetId, {
      from: 'ACTIVE',
      to: 'SUSPENDED',
      revokeSessions: true,
      action: 'USER_SUSPENDED',
      reason,
    });
  }

  reactivate(
    adminId: string,
    targetId: string,
    reason: string,
  ): Promise<AdminUser> {
    return this.change(adminId, targetId, {
      from: 'SUSPENDED',
      to: 'ACTIVE',
      revokeSessions: false,
      action: 'USER_REACTIVATED',
      reason,
    });
  }

  forcePasswordReset(
    adminId: string,
    targetId: string,
    reason: string,
  ): Promise<AdminUser> {
    return this.change(adminId, targetId, {
      from: 'ACTIVE',
      to: 'ACTIVE',
      mustChangePassword: true,
      revokeSessions: true,
      action: 'USER_PASSWORD_RESET_FORCED',
      reason,
    });
  }

  private async change(
    adminId: string,
    targetId: string,
    change: {
      from: 'ACTIVE' | 'SUSPENDED';
      to: 'ACTIVE' | 'SUSPENDED';
      mustChangePassword?: boolean;
      revokeSessions: boolean;
      action: string;
      reason: string;
    },
  ): Promise<AdminUser> {
    // An operator never acts on their own account: that needs a second admin.
    if (adminId === targetId) {
      throw adminConflict();
    }
    const result: ChangeResult = await this.users.changeUser({
      ...change,
      targetId,
      adminId,
    });
    if (result === 'not-found') throw adminNotFound();
    if (result === 'conflict') throw adminConflict();
    this.logger.log(`${change.action}: user ${targetId} by admin ${adminId}`);
    return result;
  }
}
