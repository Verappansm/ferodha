import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from './database.service';

/** One stored refresh token, as the service reads it back. */
export interface RefreshTokenRow {
  tokenHash: string;
  userId: string;
  familyId: string;
  issuedAt: Date;
  expiresAt: Date;
}

interface RefreshTokenDbRow {
  token_hash: string;
  user_id: string;
  family_id: string;
  issued_at: Date;
  expires_at: Date;
}

function toRefreshToken(row: RefreshTokenDbRow): RefreshTokenRow {
  return {
    tokenHash: row.token_hash,
    userId: row.user_id,
    familyId: row.family_id,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
  };
}

/**
 * Refresh tokens in the service's own `auth_refresh_tokens` table - the one
 * table this service owns (see persistence/schema.ts). The table is created
 * with IF NOT EXISTS: existing platform tables are never touched, and an
 * already-created instance of this one is reused as-is.
 *
 * Login writes a row for the refresh token it issues; POST /auth/refresh
 * looks the presented token up here.
 */
@Injectable()
export class RefreshTokensRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async insert(input: {
    tokenHash: string;
    userId: string;
    familyId: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth_refresh_tokens (token_hash, user_id, family_id, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [input.tokenHash, input.userId, input.familyId, input.expiresAt],
    );
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
    const result = await this.pool.query<RefreshTokenDbRow>(
      `SELECT token_hash, user_id, family_id, issued_at, expires_at
         FROM auth_refresh_tokens
        WHERE token_hash = $1`,
      [tokenHash],
    );
    return result.rows[0] ? toRefreshToken(result.rows[0]) : null;
  }
}
