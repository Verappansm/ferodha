import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../persistence/database.service';
import type { UserStatus } from '../persistence/users.repository';

/** The platform's role names, from the Sprint 3 Roles table. */
export type PlatformRole = 'client' | 'admin' | 'analyst' | 'advisor';

/** AdminUser in contracts/admin-auth-api.yaml. */
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: PlatformRole;
  status: UserStatus;
  mustChangePassword: boolean;
  accountCount: number;
  createdOn: string;
  lastLogin: string | null;
}

/** An administrator, as admin sign-in needs them. */
export interface AdminCredentials {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  status: UserStatus;
}

export interface UserFilter {
  q?: string;
  status?: UserStatus;
  role?: PlatformRole;
}

/** The outcome of a status change: the updated user, or why it did not happen. */
export type ChangeResult = AdminUser | 'not-found' | 'conflict';

interface AdminUserRow {
  user_id: string;
  name: string;
  email: string;
  role_name: PlatformRole;
  status: UserStatus | null;
  must_change_password: boolean;
  account_count: string;
  created_at: Date;
  last_login: Date | null;
}

const SELECT_ADMIN_USER = `
  SELECT u.user_id, u.name, u.email, r.role_name, u.status, u.must_change_password,
         (SELECT count(*) FROM Accounts a WHERE a.user_id = u.user_id) AS account_count,
         u.created_at, u.last_login
    FROM Users u
    JOIN Roles r ON r.role_id = u.role_id`;

function toAdminUser(row: AdminUserRow): AdminUser {
  return {
    id: row.user_id,
    name: row.name,
    email: row.email,
    role: row.role_name,
    status: row.status ?? 'PENDING',
    mustChangePassword: row.must_change_password,
    // count(*) comes back from pg as a string.
    accountCount: Number(row.account_count),
    createdOn: row.created_at.toISOString(),
    lastLogin: row.last_login ? row.last_login.toISOString() : null,
  };
}

/**
 * The admin module's queries on Users (which this service owns) and its
 * writes to admin_audit (trade_api's Liquibase 009). Every state change and
 * its audit row commit together, or not at all.
 */
@Injectable()
export class AdminUsersRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** An ACTIVE administrator by email, for admin sign-in; null otherwise. */
  async findAdminByEmail(email: string): Promise<AdminCredentials | null> {
    const result = await this.pool.query<{
      user_id: string;
      name: string;
      email: string;
      password_hash: string;
      status: UserStatus | null;
    }>(
      `SELECT u.user_id, u.name, u.email, u.password_hash, u.status
         FROM Users u
         JOIN Roles r ON r.role_id = u.role_id
        WHERE lower(u.email) = $1 AND r.role_name = 'admin'`,
      [email.toLowerCase()],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.user_id,
          name: row.name,
          email: row.email,
          passwordHash: row.password_hash,
          status: row.status ?? 'PENDING',
        }
      : null;
  }

  async recordLogin(userId: string): Promise<void> {
    await this.pool.query(
      'UPDATE Users SET last_login = NOW() WHERE user_id = $1',
      [userId],
    );
  }

  async findById(id: string): Promise<AdminUser | null> {
    const result = await this.pool.query<AdminUserRow>(
      `${SELECT_ADMIN_USER} WHERE u.user_id = $1`,
      [id],
    );
    return result.rows[0] ? toAdminUser(result.rows[0]) : null;
  }

  async list(
    filter: UserFilter,
    page: number,
    size: number,
  ): Promise<{ items: AdminUser[]; total: number }> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.q) {
      params.push(`%${filter.q}%`);
      where.push(
        `(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`,
      );
    }
    if (filter.status) {
      params.push(filter.status);
      where.push(`u.status = $${params.length}::user_status_enum`);
    }
    if (filter.role) {
      params.push(filter.role);
      where.push(`r.role_name = $${params.length}`);
    }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';

    const count = await this.pool.query<{ total: string }>(
      `SELECT count(*) AS total FROM Users u JOIN Roles r ON r.role_id = u.role_id${clause}`,
      params,
    );
    const rows = await this.pool.query<AdminUserRow>(
      `${SELECT_ADMIN_USER}${clause} ORDER BY u.created_at, u.user_id
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, size, page * size],
    );
    return {
      items: rows.rows.map(toAdminUser),
      total: Number(count.rows[0].total),
    };
  }

  /**
   * Moves a user from `from` to `to` (optionally also requiring a password
   * change), revokes every refresh token they hold when asked, and writes the
   * audit row - one transaction.
   */
  async changeUser(input: {
    targetId: string;
    adminId: string;
    from: UserStatus;
    to: UserStatus;
    mustChangePassword?: boolean;
    revokeSessions: boolean;
    action: string;
    reason: string;
  }): Promise<ChangeResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query(
        `UPDATE Users
            SET status = $3::user_status_enum,
                must_change_password = COALESCE($4, must_change_password)
          WHERE user_id = $1 AND status = $2::user_status_enum`,
        [
          input.targetId,
          input.from,
          input.to,
          input.mustChangePassword ?? null,
        ],
      );
      if (updated.rowCount !== 1) {
        await client.query('ROLLBACK');
        return (await this.exists(client, input.targetId))
          ? 'conflict'
          : 'not-found';
      }
      if (input.revokeSessions) {
        await client.query(
          `UPDATE auth_refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW())
            WHERE user_id = $1`,
          [input.targetId],
        );
      }
      await client.query(
        `INSERT INTO admin_audit (actor_id, action, target_type, target_id, reason)
         VALUES ($1, $2, 'USER', $3, $4)`,
        [input.adminId, input.action, input.targetId, input.reason],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return (await this.findById(input.targetId)) ?? 'not-found';
  }

  private async exists(client: PoolClient, id: string): Promise<boolean> {
    const result = await client.query(
      'SELECT 1 FROM Users WHERE user_id = $1',
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
