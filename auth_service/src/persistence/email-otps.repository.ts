import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from './database.service';

export interface EmailOtp {
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  sentAt: Date;
}

interface EmailOtpRow {
  code_hash: string;
  expires_at: Date;
  attempts: number;
  sent_at: Date;
}

/** The one live email-verification code per user (`auth_email_otps`). */
@Injectable()
export class EmailOtpsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Stores a new code for the user, replacing any earlier one and its attempts. */
  async replace(
    userId: string,
    codeHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth_email_otps (user_id, code_hash, expires_at, attempts, sent_at)
       VALUES ($1, $2, $3, 0, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at,
             attempts = 0, sent_at = NOW()`,
      [userId, codeHash, expiresAt],
    );
  }

  async find(userId: string): Promise<EmailOtp | null> {
    const result = await this.pool.query<EmailOtpRow>(
      `SELECT code_hash, expires_at, attempts, sent_at
         FROM auth_email_otps WHERE user_id = $1`,
      [userId],
    );
    const row = result.rows[0];
    return row
      ? {
          codeHash: row.code_hash,
          expiresAt: row.expires_at,
          attempts: row.attempts,
          sentAt: row.sent_at,
        }
      : null;
  }

  /**
   * Spends one guess and returns the stored code hash, in one statement: the guess is
   * counted before the code is compared, and only while fewer than `maxAttempts` were
   * spent and the code is still live. Concurrent guesses each take their own slot, so
   * no burst can get past the limit. Null when no guess is left (or no live code).
   */
  async claimAttempt(
    userId: string,
    maxAttempts: number,
  ): Promise<string | null> {
    const result = await this.pool.query<{ code_hash: string }>(
      `UPDATE auth_email_otps
          SET attempts = attempts + 1
        WHERE user_id = $1 AND attempts < $2 AND expires_at > NOW()
        RETURNING code_hash`,
      [userId, maxAttempts],
    );
    return result.rows[0]?.code_hash ?? null;
  }

  async delete(userId: string): Promise<void> {
    await this.pool.query('DELETE FROM auth_email_otps WHERE user_id = $1', [
      userId,
    ]);
  }
}
