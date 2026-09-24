import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { Role } from '../auth/role.enum';
import { PG_POOL } from './database.service';

/**
 * A registered user, read from the PLATFORM's Users table (Sprint 3) - the
 * auth service creates no user table of its own.
 *
 * `email` is this API's username: request bodies keep the contract's
 * `username` field name, and the value is the email address. `accountId` is
 * the additive link to the numeric account key `Accounts.id` (the BIGSERIAL
 * trade_api's Liquibase adds; its `business_ref` ACC-000001 form is
 * display-only). It is nullable in the table only because platform users
 * seeded without a trading account exist; registration always sets it.
 */
export interface AuthUser {
  id: string;
  email: string;
  passwordHash: string;
  accountId: number | null;
  roles: Role[];
  createdAt: Date;
}

/** Raised when the email's UNIQUE constraint fires - the contract's AUTH-409. */
export class UsernameTakenError extends Error {
  constructor() {
    super('username already taken');
    this.name = 'UsernameTakenError';
  }
}

interface AuthUserRow {
  user_id: string;
  email: string;
  password_hash: string;
  account_id: string | null; // BIGINT comes back from pg as a string
  role_name: string;
  created_at: Date;
}

/**
 * The contract's Role enum is exactly CUSTOMER/ADMIN; the platform's Roles
 * table is client/admin/analyst/advisor. Only `admin` maps to ADMIN - the
 * `client` role every self-registered user is pinned to, and every advisory
 * role, read as a plain trading user. Never empty.
 */
function toContractRole(roleName: string): Role {
  return roleName === 'admin' ? Role.ADMIN : Role.CUSTOMER;
}

function toAuthUser(row: AuthUserRow): AuthUser {
  return {
    id: row.user_id,
    email: row.email,
    passwordHash: row.password_hash,
    accountId: row.account_id === null ? null : Number(row.account_id),
    roles: [toContractRole(row.role_name)],
    createdAt: row.created_at,
  };
}

const SELECT_COLUMNS =
  'u.user_id, u.email, u.password_hash, u.account_id, r.role_name, u.created_at';

@Injectable()
export class UsersRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Registers into the existing Users table: `name` comes from the request
   * (the column is NOT NULL), and `role_id` is pinned to `client` - a
   * public route cannot let the caller pick a role, so a declared `roles`
   * array is ignored here.
   */
  async create(input: {
    name: string;
    email: string;
    passwordHash: string;
    accountId: number;
  }): Promise<AuthUser & { accountId: number }> {
    try {
      const result = await this.pool.query<{
        user_id: string;
        email: string;
        password_hash: string;
        account_id: string;
        created_at: Date;
      }>(
        `INSERT INTO Users (name, email, password_hash, account_id, role_id)
         VALUES ($1, $2, $3, $4,
                 (SELECT role_id FROM Roles WHERE role_name = 'client'))
         RETURNING user_id, email, password_hash, account_id, created_at`,
        [input.name, input.email, input.passwordHash, input.accountId],
      );
      const row = result.rows[0];
      return {
        id: row.user_id,
        email: row.email,
        passwordHash: row.password_hash,
        accountId: Number(row.account_id),
        roles: [Role.CUSTOMER],
        createdAt: row.created_at,
      };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === '23505') {
        // unique_violation on Users.email - the contract's AUTH-409.
        throw new UsernameTakenError();
      }
      throw error;
    }
  }

  async findByEmail(email: string): Promise<AuthUser | null> {
    const result = await this.pool.query<AuthUserRow>(
      `SELECT ${SELECT_COLUMNS}
         FROM Users u
         JOIN Roles r ON r.role_id = u.role_id
        WHERE u.email = $1`,
      [email],
    );
    return result.rows[0] ? toAuthUser(result.rows[0]) : null;
  }

  async findById(id: string): Promise<AuthUser | null> {
    const result = await this.pool.query<AuthUserRow>(
      `SELECT ${SELECT_COLUMNS}
         FROM Users u
         JOIN Roles r ON r.role_id = u.role_id
        WHERE u.user_id = $1`,
      [id],
    );
    return result.rows[0] ? toAuthUser(result.rows[0]) : null;
  }
}
