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
  usedAt: Date | null;
  revokedAt: Date | null;
}

interface RefreshTokenDbRow {
  token_hash: string;
  user_id: string;
  family_id: string;
  issued_at: Date;
  expires_at: Date;
  used_at: Date | null;
  revoked_at: Date | null;
}

function toRefreshToken(row: RefreshTokenDbRow): RefreshTokenRow {
  return {
    tokenHash: row.token_hash,
    userId: row.user_id,
    familyId: row.family_id,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    revokedAt: row.revoked_at,
  };
}

/**
 * Refresh tokens in the service's own `auth_refresh_tokens` table (see
 * persistence/schema.ts).
 *
 * Only the SHA-256 hash of a token is stored, so the raw value exists solely
 * in the response that issued it: read access to this table is not session
 * takeover. Each row belongs to a family - the chain of tokens one login
 * starts - and rotation state (used, revoked) lives on the row.
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
      `SELECT token_hash, user_id, family_id, issued_at, expires_at, used_at, revoked_at
         FROM auth_refresh_tokens
        WHERE token_hash = $1`,
      [tokenHash],
    );
    return result.rows[0] ? toRefreshToken(result.rows[0]) : null;
  }

  /**
   * Spends a token, for exactly one caller. The UPDATE only matches while
   * the row is still unused and unrevoked, and PostgreSQL row locking means
   * two concurrent presentations cannot both match: the second gets false.
   */
  async markUsed(tokenHash: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE auth_refresh_tokens
          SET used_at = NOW()
        WHERE token_hash = $1
          AND used_at IS NULL
          AND revoked_at IS NULL`,
      [tokenHash],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Reuse detected: every token in this login chain is revoked. Other
   * chains (the same user's other devices) are left alone.
   */
  async revokeFamily(familyId: string): Promise<void> {
    await this.pool.query(
      `UPDATE auth_refresh_tokens
          SET revoked_at = COALESCE(revoked_at, NOW())
        WHERE family_id = $1`,
      [familyId],
    );
  }

  /** A password change: every login chain the user holds ends. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE auth_refresh_tokens
          SET revoked_at = COALESCE(revoked_at, NOW())
        WHERE user_id = $1`,
      [userId],
    );
  }
}
