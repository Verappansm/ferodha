import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from './database.service';

/**
 * Read-only view of trading accounts. A user is registered first and an
 * account is opened for them afterwards (`Accounts.user_id` points at the
 * user), so this service only ever asks which account a user trades. It never
 * creates or changes one.
 */
@Injectable()
export class AccountsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * The numeric key (`Accounts.id`) of the user's account, or null while no
   * account has been opened for them. A user with more than one account gets
   * the oldest, so the token's accountId is the same from one login to the
   * next.
   */
  async findAccountIdForUser(userId: string): Promise<number | null> {
    const result = await this.pool.query<{ id: string }>(
      'SELECT id FROM Accounts WHERE user_id = $1 ORDER BY id LIMIT 1',
      [userId],
    );
    // BIGINT comes back from pg as a string.
    return result.rows[0] ? Number(result.rows[0].id) : null;
  }

  /**
   * The user's most recent account-opening request (LEAP-012), or null when none was
   * filed. Read-only: trade_api owns account_requests and decides them.
   */
  async findLatestRequest(userId: string): Promise<AccountRequestRow | null> {
    const result = await this.pool.query<{
      status: AccountRequestRow['status'];
      reason: string | null;
      requested_at: Date;
      decided_at: Date | null;
    }>(
      `SELECT status::text AS status, reason, requested_at, decided_at
         FROM account_requests
        WHERE user_id = $1
        ORDER BY requested_at DESC
        LIMIT 1`,
      [userId],
    );
    const row = result.rows[0];
    return row
      ? {
          status: row.status,
          reason: row.reason,
          requestedAt: row.requested_at,
          decidedAt: row.decided_at,
        }
      : null;
  }
}

export interface AccountRequestRow {
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason: string | null;
  requestedAt: Date;
  decidedAt: Date | null;
}
