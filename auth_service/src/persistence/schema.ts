/**
 * What the service creates at boot: its own refresh-token table.
 *
 * Credentials already live in the platform's Users table (Sprint 3) - `email`
 * (the username this API accepts), `password_hash`, `status`, `role_id` - so no
 * user table is created here. A user is registered first and a trading account
 * is opened for them afterwards; `Accounts.user_id` records which user owns
 * which account, so the service needs no link column of its own.
 *
 * Refresh tokens are the one thing the Sprint 3 schema has no home for
 * (per-token rotation state: used, revoked, family), so they get
 * `auth_refresh_tokens`. This file is the only definition of that table.
 *
 * Every statement is idempotent and runs on each start-up.
 */
export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
     token_hash VARCHAR(64) PRIMARY KEY,
     user_id    UUID NOT NULL REFERENCES Users (user_id) ON DELETE CASCADE,
     family_id  UUID NOT NULL,
     issued_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     expires_at TIMESTAMPTZ NOT NULL,
     used_at    TIMESTAMPTZ,
     revoked_at TIMESTAMPTZ
   )`,
  `CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_user_id
     ON auth_refresh_tokens (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_family_id
     ON auth_refresh_tokens (family_id)`,
  // An earlier version linked users to accounts through this column. The
  // link now comes from Accounts.user_id, so a database that still has the
  // column loses it.
  `ALTER TABLE Users DROP COLUMN IF EXISTS account_id`,
];
