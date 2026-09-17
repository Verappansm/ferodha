--liquibase formatted sql

-- Sprint 3 gave Accounts a cash balance but no status of its own (only
-- Users.status, which is PENDING/ACTIVE/SUSPENDED/CLOSED and describes the
-- person, not the trading account) and no version column. Sprint 5's domain
-- model and contracts/trade-api.yaml both need an account-level
-- ACTIVE/SUSPENDED/CLOSED status and an optimistic-lock version, so this adds
-- them additively rather than reusing or renaming the Users column.

--changeset trade-api:001-account-status-enum
CREATE TYPE account_status_enum AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

--changeset trade-api:002-accounts-status-and-version
ALTER TABLE Accounts
    ADD COLUMN status account_status_enum NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN version INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN last_updated TIMESTAMPTZ NOT NULL DEFAULT now();
--rollback ALTER TABLE Accounts DROP COLUMN status, DROP COLUMN version, DROP COLUMN last_updated;

-- The numeric surrogate key contracts/trade-api.yaml calls "accountId"
-- everywhere except AccountResponse.accountId (see AccountResponseDto). Kept
-- separate from Accounts.account_id, which stays the UUID primary key
-- everything else in the schema already references by foreign key -
-- renaming that column would touch every table in 001_initial_schema.sql for
-- no benefit, where adding a second, purely additive identifier does not.
--changeset trade-api:003-accounts-numeric-id
ALTER TABLE Accounts ADD COLUMN id BIGSERIAL;

--changeset trade-api:004-accounts-business-ref
ALTER TABLE Accounts ADD COLUMN business_ref VARCHAR(32);

-- Backfills the two seed accounts from 001_seed_data.sql (and anything else
-- already present) before the NOT NULL / UNIQUE constraints below are added.
--changeset trade-api:005-accounts-backfill-business-ref
UPDATE Accounts SET business_ref = 'ACC-' || LPAD(id::text, 6, '0') WHERE business_ref IS NULL;

--changeset trade-api:006-accounts-constrain-new-columns
ALTER TABLE Accounts
    ALTER COLUMN id SET NOT NULL,
    ALTER COLUMN business_ref SET NOT NULL,
    ADD CONSTRAINT uq_accounts_id UNIQUE (id),
    ADD CONSTRAINT uq_accounts_business_ref UNIQUE (business_ref);
--rollback ALTER TABLE Accounts DROP CONSTRAINT uq_accounts_business_ref, DROP CONSTRAINT uq_accounts_id, DROP COLUMN id, DROP COLUMN business_ref;
