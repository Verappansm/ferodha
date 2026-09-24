/**
 * What the service creates at boot: its OWN refresh-token table, plus the one
 * additive column the platform's Users row needs.
 *
 * Credentials already live in Users (Sprint 3) - `email` (the username this
 * API accepts), `password_hash`, `role_id` - so no user table is ever
 * created here: existing platform tables are used as they are. Registration's
 * account link rides on Users as `account_id`, pointing at the numeric
 * `Accounts.id` (the BIGSERIAL trade_api's Liquibase adds in
 * db/changelog/001-account-status-and-locking.sql; its `business_ref`
 * ACC-000001 form is display-only).
 *
 * Refresh tokens are the one piece the Sprint 3 schema has no home for (per-
 * token rotation state: used, revoked, family), so they get the service's
 * own `auth_refresh_tokens` - created with IF NOT EXISTS, so an existing
 * copy is kept as-is and nothing platform-owned is duplicated.
 *
 * Caveat: IF NOT EXISTS cannot repair a WRONG shape. A database still
 * carrying a pre-email-era auth_refresh_tokens (its FK pointed at the
 * interim auth_users table) must be migrated once by hand, since inserts of
 * Users.user_id otherwise violate that stale constraint:
 *   DROP TABLE IF EXISTS auth_refresh_tokens, auth_users;
 * the next boot then recreates the table against Users.
 *
 * The same statements live in `database/migrations/002_auth_service.sql` so
 * the platform's migration runner also records them; both are safe to run
 * repeatedly. If you change one, change the other.
 *
 * What this service never does: create a trading account. Registration only
 * checks that an `Accounts.id` exists (else VAL-422) and records the link on
 * the user's own row; it never inserts into Accounts.
 */
export const SCHEMA_STATEMENTS: string[] = [
  // The registered account link: the Accounts.id of the account the user
  // registered against. Nullable because platform users seeded without a
  // trading account (an advisor, say) legitimately exist.
  `ALTER TABLE Users ADD COLUMN IF NOT EXISTS account_id BIGINT`,
  // The service's own table: refresh tokens stored as SHA-256 hashes, grouped
  // into the chain (family) each login starts so reuse can kill all of them.
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
  // Point seeded users at the account they already own in Accounts. Guarded
  // on IS NULL, so a registration's chosen accountId is never overwritten.
  `UPDATE Users u
      SET account_id = a.id
     FROM Accounts a
    WHERE a.user_id = u.user_id
      AND u.account_id IS NULL`,
];

/**
 * The probe answers "are BOTH dependencies there yet?" - the service's own
 * table *and* the account_id column on Users. It must fail when either is
 * missing: probing only the table let a database that already carried a
 * compatible auth_refresh_tokens skip everything, and register() then died
 * with a 500 over the missing column.
 *
 * PostgreSQL reports a missing relation as 42P01 and a missing column as
 * 42703; DatabaseService treats either as "run the statements above".
 * Everything there is IF NOT EXISTS / IF EXISTS, so a database that has it
 * all runs nothing harmful.
 */
export const SCHEMA_PROBE =
  'SELECT u.account_id, t.token_hash FROM Users u CROSS JOIN auth_refresh_tokens t LIMIT 1';
