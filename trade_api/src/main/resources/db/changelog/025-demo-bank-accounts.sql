--liquibase formatted sql

--changeset trade-api:025-demo-bank-accounts
-- Decision 0012: a trading account opens only on the bank account the bank already holds
-- under the applicant's verified email. The seed's three bank accounts all belong to
-- existing customers, so a new sign-up could never be approved. These stand for customers
-- of the bank who have not signed up yet: register with one of these emails, verify it,
-- and the admin console can approve. Bank PIN 1234 (stored as bcrypt of the browser's
-- proof, as for every bank row).
INSERT INTO Third_Party_Bank (bank_account_number, email, pin_hash, balance, currency)
VALUES ('BANK-200001', 'demo.one@example.com',   '$2a$12$ch3EQdBNKa1elzmBWHiDD.X7/MPxjMcRYNO4UoYgmKaxnkp1tO6jG', 50000.0000, 'USD'),
       ('BANK-200002', 'demo.two@example.com',   '$2a$12$ch3EQdBNKa1elzmBWHiDD.X7/MPxjMcRYNO4UoYgmKaxnkp1tO6jG', 50000.0000, 'USD'),
       ('BANK-200003', 'demo.three@example.com', '$2a$12$ch3EQdBNKa1elzmBWHiDD.X7/MPxjMcRYNO4UoYgmKaxnkp1tO6jG', 50000.0000, 'USD'),
       ('BANK-200004', 'demo.inr@example.com',   '$2a$12$ch3EQdBNKa1elzmBWHiDD.X7/MPxjMcRYNO4UoYgmKaxnkp1tO6jG', 4000000.0000, 'INR')
ON CONFLICT DO NOTHING;
--rollback DELETE FROM Third_Party_Bank WHERE bank_account_number IN ('BANK-200001', 'BANK-200002', 'BANK-200003', 'BANK-200004');
