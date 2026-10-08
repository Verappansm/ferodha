--liquibase formatted sql

--changeset trade-api:021-bank-account-linking
-- Third_Party_Bank stands for the customer's own bank, a system we do not own. Its
-- rows are added in Postgres, by whoever runs the bank side, before the customer
-- ever registers with us, so a row must not need a Users row to exist first (the
-- original foreign key to Users(email) forced the admin console to create bank rows
-- at approval time, which is exactly what must not happen).
ALTER TABLE Third_Party_Bank DROP CONSTRAINT IF EXISTS third_party_bank_email_fkey;

-- One bank account per person (the email the bank holds) ...
CREATE UNIQUE INDEX IF NOT EXISTS uq_third_party_bank_email ON Third_Party_Bank (lower(email));

-- ... and one trading account per bank account. Together: a user can hold only one
-- bank account, and a bank account can belong to only one user.
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_bank_account_number ON Accounts (bank_account_number);

-- Set when the user enters the code mailed to their address: proof the email, and so
-- the bank account held under it, is theirs. An account is opened only after this.
ALTER TABLE Users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Everyone who already has an account, and every administrator, was vetted by hand.
UPDATE Users SET email_verified_at = COALESCE(created_at, now())
WHERE email_verified_at IS NULL
  AND (user_id IN (SELECT user_id FROM Accounts)
       OR role_id IN (SELECT role_id FROM Roles WHERE role_name <> 'client'));
--rollback DROP INDEX IF EXISTS uq_third_party_bank_email; DROP INDEX IF EXISTS uq_accounts_bank_account_number; ALTER TABLE Users DROP COLUMN IF EXISTS email_verified_at;
