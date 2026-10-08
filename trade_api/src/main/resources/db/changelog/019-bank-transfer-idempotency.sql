--liquibase formatted sql

-- The original schema already has the key column. This constraint makes a
-- browser retry unable to duplicate a money movement, even across processes.
--changeset trade-api:023-bank-transfer-idempotency
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_idempotency_key
    ON Transactions (idempotency_key)
    WHERE idempotency_key IS NOT NULL;
--rollback DROP INDEX IF EXISTS uq_transactions_idempotency_key;

-- The original demonstration rows used placeholders rather than verifiers.
-- These are bcrypt verifiers for the bcrypt client proof of demo PIN 1234.
--changeset trade-api:024-bank-pin-verifiers
UPDATE Third_Party_Bank SET pin_hash = '$2b$12$60Aj/xeeNk.Ak99k1Gkl9O7dH4Uuv.UXof4/xT8RTuD5zKwwG39pG'
WHERE bank_account_number = 'BANK-100001' AND pin_hash = '$2b$12$dummy_pin_hash_001';
UPDATE Third_Party_Bank SET pin_hash = '$2b$12$VcGPIi4o1Huo6xzHOPfCv.TsrFxael45ranDYTWoDe.zFy7XdrtLy'
WHERE bank_account_number = 'BANK-100002' AND pin_hash = '$2b$12$dummy_pin_hash_002';
UPDATE Third_Party_Bank SET pin_hash = '$2b$12$zaYCuTMeTVl7AsfLSCyzX.bnvaWhFwQClIVhHBWvjt0JR1F0kDyn6'
WHERE bank_account_number = 'BANK-100003' AND pin_hash = '$2b$12$dummy_pin_hash_003';
