-- ============================================================
-- ACCOUNTS SEED DATA WITH NUMERIC IDs
-- ============================================================
-- This file creates test accounts with numeric IDs for the auth service
-- and trading system. Run this AFTER 001_initial_schema.sql and
-- 003_add_accounts_numeric_id.sql migrations.


-- ============================================================
-- 1. ENSURE ROLES EXIST
-- ============================================================
INSERT INTO Roles (role_name)
VALUES ('client'), ('admin'), ('analyst'), ('advisor')
ON CONFLICT (role_name) DO NOTHING;


-- ============================================================
-- 2. INSERT TEST USERS
-- ============================================================
INSERT INTO Users (user_id, name, email, phone_number, password_hash, status, role_id, created_at)
SELECT '11111111-1111-1111-1111-111111111111', 'John Carter', 'john.carter@example.com', '+1-202-555-0101', '$2b$12$john_dummy_password_hash', 'ACTIVE', role_id, NOW()
FROM Roles WHERE role_name = 'client'
ON CONFLICT DO NOTHING;


INSERT INTO Users (user_id, name, email, phone_number, password_hash, status, role_id, created_at)
SELECT '22222222-2222-2222-2222-222222222222', 'Emily Stone', 'emily.stone@example.com', '+1-202-555-0102', '$2b$12$emily_dummy_password_hash', 'ACTIVE', role_id, NOW()
FROM Roles WHERE role_name = 'client'
ON CONFLICT DO NOTHING;


INSERT INTO Users (user_id, name, email, phone_number, password_hash, status, role_id, created_at)
SELECT '33333333-3333-3333-3333-333333333333', 'Robert Wilson', 'robert.wilson@example.com', '+1-202-555-0103', '$2b$12$robert_dummy_password_hash', 'ACTIVE', role_id, NOW()
FROM Roles WHERE role_name = 'advisor'
ON CONFLICT DO NOTHING;


-- ============================================================
-- 3. INSERT THIRD PARTY BANK ACCOUNTS
-- ============================================================
INSERT INTO Third_Party_Bank (bank_account_number, email, pin_hash, balance)
VALUES
    ('BANK-100001', 'john.carter@example.com', '$2b$12$dummy_pin_hash_001', 25000.0000),
    ('BANK-100002', 'emily.stone@example.com', '$2b$12$dummy_pin_hash_002', 40000.0000)
ON CONFLICT DO NOTHING;


-- ============================================================
-- 4. INSERT TRADING ACCOUNTS WITH NUMERIC IDs
-- ============================================================
-- These accounts will have automatically assigned numeric IDs (1, 2, 3, ...)
-- via the BIGSERIAL column. The first account will have id=1 which is used
-- for auth service registration testing.
INSERT INTO Accounts (account_id, user_id, advisor_id, bank_account_number, currency, cash_balance, status, version, business_ref)
VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'BANK-100001', 'USD', 15000.0000, 'ACTIVE', 0, 'ACC-000001'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'BANK-100002', 'USD', 22000.0000, 'ACTIVE', 0, 'ACC-000002')
ON CONFLICT DO NOTHING;


-- ============================================================
-- VERIFICATION QUERIES (comment out in production)
-- ============================================================
-- SELECT 'Roles:' as section; SELECT * FROM Roles;
-- SELECT 'Users:' as section; SELECT user_id, name, email FROM Users;
-- SELECT 'Accounts with Numeric IDs:' as section; SELECT id, account_id, business_ref, user_id FROM Accounts;



