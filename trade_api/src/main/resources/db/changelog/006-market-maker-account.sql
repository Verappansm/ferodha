--liquibase formatted sql

-- Backs the randomizer's synthetic orders (see trades_generator's
-- OrderGenerator, market-sim only) with one real Account row rather than a
-- fabricated account id nothing else in the schema recognises - every FK
-- from Orders/Accounts/Trades stays honest this way, and the existing
-- affordability/holdings re-check in OrderBookMatcher (see trade_executor)
-- needs no special-casing at all: this account passes those checks the
-- same way any other account would, just because it is seeded deep enough
-- in cash and (below) in holdings that it never plausibly fails them.

--changeset trade-api:001-market-maker-user
INSERT INTO Users (user_id, name, email, phone_number, password_hash, status, role_id)
VALUES ('99999999-0000-0000-0000-000000000001', 'Market Maker', 'market-maker@internal.system',
        NULL, '$2b$12$not_a_real_login', 'ACTIVE',
        (SELECT role_id FROM Roles WHERE role_name = 'client'));
--rollback DELETE FROM Users WHERE user_id = '99999999-0000-0000-0000-000000000001';

--changeset trade-api:002-market-maker-bank
INSERT INTO Third_Party_Bank (bank_account_number, email, pin_hash, balance)
VALUES ('BANK-MARKETMAKER', 'market-maker@internal.system', '$2b$12$not_a_real_pin', 999999999.0000);
--rollback DELETE FROM Third_Party_Bank WHERE bank_account_number = 'BANK-MARKETMAKER';

--changeset trade-api:003-market-maker-account
INSERT INTO Accounts (account_id, user_id, advisor_id, bank_account_number, currency, cash_balance, business_ref)
VALUES ('99999999-0000-0000-0000-000000000002', '99999999-0000-0000-0000-000000000001', NULL,
        'BANK-MARKETMAKER', 'USD', 999999999.0000, 'ACC-MARKET-MAKER');
--rollback DELETE FROM Accounts WHERE account_id = '99999999-0000-0000-0000-000000000002';

-- One large historical FILLED BUY, source RANDOMIZER, per currently-tradable
-- instrument - gives the market-maker deep enough holdings that its resting
-- SELL side of a synthetic match passes OrderBookMatcher's holdings
-- re-check too. Runs once, against whatever is tradable right now; an
-- instrument added after this migration runs has no seeded holdings for it
-- (a known, accepted gap - see the extension story this ships with).
--changeset trade-api:004-market-maker-seed-holdings
INSERT INTO Orders (user_id, account_id, instrument_id, side, order_type, limit_price, quantity,
                     status, placed_at, executed_price, executed_on, source, filled_quantity, idempotency_key)
SELECT '99999999-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000002', i.instrument_id,
       'BUY'::order_side_enum, 'LIMIT'::order_type_enum, 1.0000, 1000000,
       'FILLED'::order_status_enum, now(), 1.0000, now(), 'RANDOMIZER', 1000000, 'SEED-MM-' || i.ticker
FROM Instruments i
WHERE i.tradable = true;
--rollback DELETE FROM Orders WHERE account_id = '99999999-0000-0000-0000-000000000002' AND idempotency_key LIKE 'SEED-MM-%';

--changeset trade-api:005-market-maker-seed-trades
INSERT INTO Trades (order_id, execution_price, execution_quantity)
SELECT o.order_id, 1.0000, 1000000
FROM Orders o
WHERE o.account_id = '99999999-0000-0000-0000-000000000002' AND o.idempotency_key LIKE 'SEED-MM-%';
--rollback DELETE FROM Trades WHERE order_id IN (SELECT order_id FROM Orders WHERE account_id = '99999999-0000-0000-0000-000000000002' AND idempotency_key LIKE 'SEED-MM-%');
