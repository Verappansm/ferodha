import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from './database.service';

/**
 * Read-only view onto trading accounts.
 *
 * The auth service must never create an account - `Accounts` belongs to the
 * Sprint 3 schema: the numeric `id` (the BIGSERIAL trade_api's Liquibase adds;
 * its `business_ref` ACC-000001 form is display-only) is the account key the
 * contract's `accountId` names - so this repository has exactly one
 * operation: does that account already exist? Registration turns a "no" into
 * VAL-422 and records the link on the user's own row.
 */
@Injectable()
export class AccountsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async exists(accountId: number): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT 1 FROM Accounts WHERE id = $1 LIMIT 1',
      [accountId],
    );
    return result.rows.length > 0;
  }
}
