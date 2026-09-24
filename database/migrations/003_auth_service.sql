-- Sprint 5/8: Add numeric ID, status, and version columns to Accounts table
-- This adds the BIGSERIAL numeric `id` that the auth service and contracts require,
-- separate from the UUID `account_id` primary key.


-- Add account status enum
DO $$
BEGIN
    CREATE TYPE account_status_enum AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- Add the new columns
ALTER TABLE Accounts
    ADD COLUMN IF NOT EXISTS status account_status_enum NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS id BIGSERIAL,
    ADD COLUMN IF NOT EXISTS business_ref VARCHAR(32) DEFAULT 'PENDING';


-- Backfill business_ref for existing accounts
UPDATE Accounts
SET business_ref = 'ACC-' || LPAD(id::text, 6, '0')
WHERE (business_ref IS NULL OR business_ref = 'PENDING') AND id IS NOT NULL;


-- Set NOT NULL constraints and add unique constraints
DO $$
BEGIN
    ALTER TABLE Accounts ALTER COLUMN id SET NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


DO $$
BEGIN
    ALTER TABLE Accounts ALTER COLUMN business_ref SET NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


DO $$
BEGIN
    ALTER TABLE Accounts ADD CONSTRAINT uq_accounts_id UNIQUE (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


DO $$
BEGIN
    ALTER TABLE Accounts ADD CONSTRAINT uq_accounts_business_ref UNIQUE (business_ref);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
