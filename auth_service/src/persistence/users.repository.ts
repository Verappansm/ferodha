import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { Role } from '../auth/role.enum';
import { PG_POOL } from './database.service';

/** Users.status (user_status_enum in the Sprint 3 schema). */
export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

/**
 * A registered user, read from the platform's Users table (Sprint 3). The auth
 * service creates no user table of its own.
 *
 * `email` is this API's username: request bodies keep the contract's
 * `username` field name, and the value is the email address, always stored
 * and looked up in lower case. Which trading account the user owns is not on
 * this row; AccountsRepository answers that from Accounts.user_id.
 */
export interface AuthUser {
  id: string;
  email: string;
  passwordHash: string;
  status: UserStatus;
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
  status: UserStatus | null;
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
    // The column is nullable in the Sprint 3 schema; a NULL has never been
    // activated, which is what PENDING means.
    status: row.status ?? 'PENDING',
    roles: [toContractRole(row.role_name)],
    createdAt: row.created_at,
  };
}

const SELECT_USER = `
  SELECT u.user_id, u.email, u.password_hash, u.status, r.role_name, u.created_at
    FROM Users u
    JOIN Roles r ON r.role_id = u.role_id`;

@Injectable()
export class UsersRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Registers into the existing Users table as an ACTIVE `client`. A public
   * route cannot let the caller pick a role, so a declared `roles` array never
   * reaches this method.
   */
  async create(input: {
    name: string;
    email: string;
    passwordHash: string;
  }): Promise<AuthUser> {
    try {
      const result = await this.pool.query<AuthUserRow>(
        `INSERT INTO Users (name, email, password_hash, status, role_id)
         VALUES ($1, $2, $3, 'ACTIVE',
                 (SELECT role_id FROM Roles WHERE role_name = 'client'))
         RETURNING user_id, email, password_hash, status,
                   'client' AS role_name, created_at`,
        [input.name, input.email, input.passwordHash],
      );
      return toAuthUser(result.rows[0]);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        // unique_violation on Users.email - the contract's AUTH-409.
        throw new UsernameTakenError();
      }
      throw error;
    }
  }

  /**
   * `email` arrives lower-cased from the DTO. The column is compared lower-
   * cased too, so a row written in mixed case before emails were normalised
   * (the seed, an older registration) is still found.
   */
  async findByEmail(email: string): Promise<AuthUser | null> {
    const result = await this.pool.query<AuthUserRow>(
      `${SELECT_USER} WHERE lower(u.email) = $1`,
      [email.toLowerCase()],
    );
    return result.rows[0] ? toAuthUser(result.rows[0]) : null;
  }

  async findById(id: string): Promise<AuthUser | null> {
    const result = await this.pool.query<AuthUserRow>(
      `${SELECT_USER} WHERE u.user_id = $1`,
      [id],
    );
    return result.rows[0] ? toAuthUser(result.rows[0]) : null;
  }
}
