-- Sprint 8: the auth service's own table, plus one additive column.
--
-- Existing platform tables are used as they are: credentials live in Users
-- (Sprint 3) - `email` is the username this API accepts, `password_hash` is
-- bcrypt, `role_id` points at Roles - and the numeric trading account key is
-- Accounts.id, the BIGSERIAL trade_api's Liquibase adds in
-- db/changelog/001-account-status-and-locking.sql (its business_ref
-- 'ACC-000001' form is display-only). Nothing here recreates a table that
-- already exists.
--
-- The one table the service owns is auth_refresh_tokens: the Sprint 3 schema
-- has nowhere to keep per-token rotation state. Refresh tokens are stored as
-- SHA-256 hashes, grouped into the chain (family) each login starts.
--
-- The same statements run inside the service at start-up
-- (auth_service/src/persistence/schema.ts); both copies are safe to run
-- repeatedly. If you change one, change the other.
--
-- Accounts itself is never written by this service: registration checks that
-- an id exists (else VAL-422) and records the link on the user's row.

ALTER TABLE Users ADD COLUMN IF NOT EXISTS account_id BIGINT;

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
    token_hash VARCHAR(64) PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES Users (user_id) ON DELETE CASCADE,
    family_id  UUID NOT NULL,
    issued_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_user_id
    ON auth_refresh_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_family_id
    ON auth_refresh_tokens (family_id);

-- Point seeded users at the account they already own. Guarded on IS NULL,
-- so a registration's chosen accountId is never overwritten.
UPDATE Users u
   SET account_id = a.id
  FROM Accounts a
 WHERE a.user_id = u.user_id
   AND u.account_id IS NULL;

