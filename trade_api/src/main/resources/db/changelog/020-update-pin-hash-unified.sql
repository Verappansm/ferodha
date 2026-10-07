--liquibase formatted sql

-- Update all Third_Party_Bank pin_hash values to unified bcrypt hash of '1234'
-- This replaces the account-specific demo hashes with a single consistent hash
-- to be used across all bank accounts for development/testing purposes.
--changeset trade-api:025-pin-hash-unified
UPDATE Third_Party_Bank
SET pin_hash = '$2b$12$D6aOfmGWG4oQpLdkJ0PV.eoxub08hIXYphEVFFv9OlsB8EJNwktz.'
WHERE bank_account_number IN ('BANK-100001', 'BANK-100002', 'BANK-100003');
--rollback UPDATE Third_Party_Bank SET pin_hash = '$2b$12$60Aj/xeeNk.Ak99k1Gkl9O7dH4Uuv.UXof4/xT8RTuD5zKwwG39pG' WHERE bank_account_number = 'BANK-100001'; UPDATE Third_Party_Bank SET pin_hash = '$2b$12$VcGPIi4o1Huo6xzHOPfCv.TsrFxael45ranDYTWoDe.zFy7XdrtLy' WHERE bank_account_number = 'BANK-100002'; UPDATE Third_Party_Bank SET pin_hash = '$2b$12$zaYCuTMeTVl7AsfLSCyzX.bnvaWhFwQClIVhHBWvjt0JR1F0kDyn6' WHERE bank_account_number = 'BANK-100003';
