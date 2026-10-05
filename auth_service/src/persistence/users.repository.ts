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
  name: string;
  email: string;
  passwordHash: string;
  status: UserStatus;
  roles: Role[];
  createdAt: Date;
  phone: string | undefined;
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
  name: string;
  email: string;
  phone_number: string | null;
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
    name: row.name,
    email: row.email,
    phone: row.phone_number ?? undefined,
    passwordHash: row.password_hash,
    // The column is nullable in the Sprint 3 schema; a NULL has never been
    // activated, which is what PENDING means.
    status: row.status ?? 'PENDING',
    roles: [toContractRole(row.role_name)],
    createdAt: row.created_at,
  };
}

const SELECT_USER = `
  SELECT u.user_id, u.name, u.email, u.phone_number, u.password_hash, u.status, r.role_name, u.created_at
    FROM Users u
    JOIN Roles r ON r.role_id = u.role_id`;

@Injectable()
export class UsersRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Registers into the existing Users table as an ACTIVE `client`, and files
   * a PENDING account-opening request for them (`account_requests`, LEAP-011)
   * in the same transaction, so there is never a registered user with no
   * request or a request with no user. The Accounts row is opened only when
   * an admin approves the request; until then the user cannot log in.
   *
   * A public route cannot let the caller pick a role, so a declared `roles`
   * array never reaches this method.
   */
  async createWithAccountRequest(input: {
    name: string;
    email: string;
    passwordHash: string;
  }): Promise<AuthUser> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<AuthUserRow>(
        `INSERT INTO Users (name, email, password_hash, status, role_id)
         VALUES ($1, $2, $3, 'ACTIVE',
                 (SELECT role_id FROM Roles WHERE role_name = 'client'))
         RETURNING user_id, name, email, phone_number, password_hash, status,
                   'client' AS role_name, created_at`,
        [input.name, input.email, input.passwordHash],
      );
      const user = toAuthUser(result.rows[0]);
      await client.query('INSERT INTO account_requests (user_id) VALUES ($1)', [
        user.id,
      ]);
      await client.query('COMMIT');
      return user;
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') {
        // unique_violation on Users.email - the contract's AUTH-409.
        throw new UsernameTakenError();
      }
      throw error;
    } finally {
      client.release();
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

  /**
   * The profile page's edit (LEAP-020): the name and phone only. An
   * undefined field is left unchanged; a null phone clears it.
   */
  async updateProfile(
    id: string,
    changes: { name?: string; phone?: string | null },
  ): Promise<AuthUser | null> {
    await this.pool.query(
      `UPDATE Users
          SET name = COALESCE($2::varchar, name),
              phone_number = CASE WHEN $3::boolean THEN $4::varchar ELSE phone_number END
        WHERE user_id = $1`,
      [
        id,
        changes.name ?? null,
        changes.phone !== undefined,
        changes.phone ?? null,
      ],
    );
    return this.findById(id);
  }
}
