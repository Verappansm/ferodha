--liquibase formatted sql

-- Demo PIN 1234 for the three seeded bank accounts.
--
-- How a PIN is checked: the browser never sends the PIN. It sends a bcrypt proof
-- of it, made with a fixed salt (BankComponent, PIN_PROOF_SALT), which for 1234 is
--   $2b$12$D6aOfmGWG4oQpLdkJ0PV.eoxub08hIXYphEVFFv9OlsB8EJNwktz.
-- The server then bcrypt-verifies that proof against Third_Party_Bank.pin_hash,
-- so the stored value has to be a bcrypt OF THE PROOF, not of the PIN and not
-- the proof itself. The values written by 019-bank-transfer-idempotency (and the
-- unused 020-update-pin-hash-unified) were neither, so no PIN could ever match.
-- Overwritten unconditionally for these demo rows; accounts opened through the
-- admin console keep 'not-set' and cannot move money until a PIN is set.
--changeset trade-api:001-bank-demo-pin-verifiers
UPDATE Third_Party_Bank SET pin_hash = '$2b$12$OMaQKMih0gu3tMd7qpuhoOMCMRoAPls02keyFWziczafWfDnr9WPu'
WHERE bank_account_number = 'BANK-100001';
UPDATE Third_Party_Bank SET pin_hash = '$2b$12$GZ6CtHrZZ5sIVMG6g1gFqOYVEKGALpml8oVyBcbGi5Ukneivt8vs2'
WHERE bank_account_number = 'BANK-100002';
UPDATE Third_Party_Bank SET pin_hash = '$2b$12$YUCAEt22Tl9oHZ4dJ8/kd.iXSKZu8GuQqJMGvMXU6XE/zdvaCAl4i'
WHERE bank_account_number = 'BANK-100003';
--rollback UPDATE Third_Party_Bank SET pin_hash = '$2b$12$dummy_pin_hash_001' WHERE bank_account_number = 'BANK-100001'; UPDATE Third_Party_Bank SET pin_hash = '$2b$12$dummy_pin_hash_002' WHERE bank_account_number = 'BANK-100002'; UPDATE Third_Party_Bank SET pin_hash = '$2b$12$dummy_pin_hash_003' WHERE bank_account_number = 'BANK-100003';
