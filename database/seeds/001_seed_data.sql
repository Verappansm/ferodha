-- 2. USERS
-- ============================================================

INSERT INTO Users
    (user_id, name, email, phone_number, password_hash, status, role_id)
VALUES
    (
        '11111111-1111-1111-1111-111111111111',
        'John Carter',
        'john.carter@example.com',
        '+1-202-555-0101',
        '$2b$12$john_dummy_password_hash',
        'ACTIVE',
        (SELECT role_id FROM Roles WHERE role_name = 'client')
    ),
    (
        '22222222-2222-2222-2222-222222222222',
        'Emily Stone',
        'emily.stone@example.com',
        '+1-202-555-0102',
        '$2b$12$emily_dummy_password_hash',
        'ACTIVE',
        (SELECT role_id FROM Roles WHERE role_name = 'client')
    ),
    (
        '33333333-3333-3333-3333-333333333333',
        'Robert Wilson',
        'robert.wilson@example.com',
        '+1-202-555-0103',
        '$2b$12$robert_dummy_password_hash',
        'ACTIVE',
        (SELECT role_id FROM Roles WHERE role_name = 'advisor')
    ),
    (
        '44444444-4444-4444-4444-444444444444',
        'Sarah Johnson',
        'sarah.johnson@example.com',
        '+1-202-555-0104',
        '$2b$12$sarah_dummy_password_hash',
        'ACTIVE',
        (SELECT role_id FROM Roles WHERE role_name = 'analyst')
    ),
    (
        '55555555-5555-5555-5555-555555555555',
        'Michael Brown',
        'michael.brown@example.com',
        '+1-202-555-0105',
        '$2b$12$michael_dummy_password_hash',
        'ACTIVE',
        (SELECT role_id FROM Roles WHERE role_name = 'admin')
    );


-- ============================================================
-- 3. THIRD PARTY BANK
-- ============================================================

INSERT INTO Third_Party_Bank
    (bank_account_number, email, pin_hash, balance)
VALUES
    (
        'BANK-100001',
        'john.carter@example.com',
        '$2b$12$dummy_pin_hash_001',
        25000.0000
    ),
    (
        'BANK-100002',
        'emily.stone@example.com',
        '$2b$12$dummy_pin_hash_002',
        40000.0000
    );


-- ============================================================
-- 4. ACCOUNTS
-- ============================================================

INSERT INTO Accounts
    (account_id, user_id, advisor_id, bank_account_number, currency, cash_balance)
VALUES
    (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111',
        '33333333-3333-3333-3333-333333333333',
        'BANK-100001',
        'USD',
        15000.0000
    ),
    (
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
        'BANK-100002',
        'USD',
        22000.0000
    );


-- ============================================================
-- 5. INSTRUMENTS
-- ============================================================

INSERT INTO Instruments
    (instrument_id, ticker, name, exchange, currency, type, sector)
VALUES
    (
        'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa',
        'AAPL',
        'Apple Inc.',
        'NASDAQ',
        'USD',
        'EQUITY',
        'Technology'
    ),
    (
        'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb',
        'MSFT',
        'Microsoft Corporation',
        'NASDAQ',
        'USD',
        'EQUITY',
        'Technology'
    ),
    (
        'cccccccc-3333-3333-3333-cccccccccccc',
        'NVDA',
        'NVIDIA Corporation',
        'NASDAQ',
        'USD',
        'EQUITY',
        'Technology'
    ),
    (
        'dddddddd-4444-4444-4444-dddddddddddd',
        'SPY',
        'SPDR S&P 500 ETF Trust',
        'NYSE ARCA',
        'USD',
        'ETF',
        'Index'
    ),
    (
        'eeeeeeee-5555-5555-5555-eeeeeeeeeeee',
        'TSLA',
        'Tesla Inc.',
        'NASDAQ',
        'USD',
        'EQUITY',
        'Automotive'
    );


-- ============================================================
-- 6. MARKET DATA
-- ============================================================

INSERT INTO Market_Data
    (instrument_id, timestamp, open_price, close_price, high_price, low_price)
VALUES

    -- AAPL
    ('aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa',
     '2026-08-18 14:30:00+00',
     228.5000, 230.1000, 231.2000, 227.8000),

    ('aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa',
     '2026-08-19 14:30:00+00',
     230.1000, 232.4500, 233.1000, 229.5000),

    ('aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa',
     '2026-08-20 14:30:00+00',
     232.4500, 234.2000, 235.0000, 231.9000),

    -- MSFT
    ('bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb',
     '2026-08-18 14:30:00+00',
     505.0000, 508.2000, 510.0000, 503.5000),

    ('bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb',
     '2026-08-19 14:30:00+00',
     508.2000, 511.7500, 513.0000, 507.8000),

    ('bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb',
     '2026-08-20 14:30:00+00',
     511.7500, 514.3000, 516.0000, 510.9000),

    -- NVDA
    ('cccccccc-3333-3333-3333-cccccccccccc',
     '2026-08-18 14:30:00+00',
     180.0000, 183.5000, 185.2000, 179.2000),

    ('cccccccc-3333-3333-3333-cccccccccccc',
     '2026-08-19 14:30:00+00',
     183.5000, 187.2500, 188.5000, 182.7000),

    ('cccccccc-3333-3333-3333-cccccccccccc',
     '2026-08-20 14:30:00+00',
     187.2500, 191.8000, 193.0000, 186.9000),

    -- SPY
    ('dddddddd-4444-4444-4444-dddddddddddd',
     '2026-08-18 14:30:00+00',
     640.0000, 642.5000, 644.0000, 638.8000),

    ('dddddddd-4444-4444-4444-dddddddddddd',
     '2026-08-19 14:30:00+00',
     642.5000, 645.1000, 646.5000, 641.7000),

    ('dddddddd-4444-4444-4444-dddddddddddd',
     '2026-08-20 14:30:00+00',
     645.1000, 647.8000, 649.0000, 644.5000),

    -- TSLA
    ('eeeeeeee-5555-5555-5555-eeeeeeeeeeee',
     '2026-08-18 14:30:00+00',
     335.0000, 340.2000, 342.5000, 332.8000),

    ('eeeeeeee-5555-5555-5555-eeeeeeeeeeee',
     '2026-08-19 14:30:00+00',
     340.2000, 344.7000, 346.0000, 338.9000),

    ('eeeeeeee-5555-5555-5555-eeeeeeeeeeee',
     '2026-08-20 14:30:00+00',
     344.7000, 348.9000, 351.0000, 343.8000);


-- ============================================================
-- 7. ORDERS
-- ============================================================

INSERT INTO Orders
    (
        order_id,
        user_id,
        account_id,
        instrument_id,
        side,
        order_type,
        limit_price,
        quantity,
        status,
        idempotency_key
    )
VALUES
    (
        '10000000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa',
        'BUY',
        'LIMIT',
        225.0000,
        20.0000,
        'FILLED',
        'ORDER-IDEMP-0001'
    ),
    (
        '10000000-0000-0000-0000-000000000002',
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'cccccccc-3333-3333-3333-cccccccccccc',
        'BUY',
        'MARKET',
        NULL,
        15.0000,
        'FILLED',
        'ORDER-IDEMP-0002'
    ),
    (
        '10000000-0000-0000-0000-000000000003',
        '22222222-2222-2222-2222-222222222222',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb',
        'BUY',
        'LIMIT',
        500.0000,
        10.0000,
        'FILLED',
        'ORDER-IDEMP-0003'
    ),
    (
        '10000000-0000-0000-0000-000000000004',
        '22222222-2222-2222-2222-222222222222',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'eeeeeeee-5555-5555-5555-eeeeeeeeeeee',
        'BUY',
        'MARKET',
        NULL,
        8.0000,
        'FILLED',
        'ORDER-IDEMP-0004'
    ),
    (
        '10000000-0000-0000-0000-000000000005',
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa',
        'SELL',
        'LIMIT',
        235.0000,
        5.0000,
        'PENDING',
        'ORDER-IDEMP-0005'
    );


-- ============================================================
-- 8. TRADES
-- NOTE:
-- Trades has NO instrument_id column.
-- Instrument is obtained through Orders.instrument_id.
-- ============================================================

INSERT INTO Trades
    (
        trade_id,
        order_id,
        execution_price,
        execution_quantity,
        executed_at,
        idempotency_key
    )
VALUES
    (
        '20000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        228.5000,
        20.0000,
        '2026-08-18 15:00:00+00',
        'TRADE-IDEMP-0001'
    ),
    (
        '20000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000002',
        184.7500,
        15.0000,
        '2026-08-19 15:00:00+00',
        'TRADE-IDEMP-0002'
    ),
    (
        '20000000-0000-0000-0000-000000000003',
        '10000000-0000-0000-0000-000000000003',
        505.5000,
        10.0000,
        '2026-08-19 15:30:00+00',
        'TRADE-IDEMP-0003'
    ),
    (
        '20000000-0000-0000-0000-000000000004',
        '10000000-0000-0000-0000-000000000004',
        342.0000,
        8.0000,
        '2026-08-20 15:00:00+00',
        'TRADE-IDEMP-0004'
    );


-- ============================================================
-- 9. TRANSACTIONS
-- ============================================================

INSERT INTO Transactions
    (
        transaction_id,
        account_id,
        transaction_type,
        amount,
        transaction_date,
        metadata,
        idempotency_key
    )
VALUES
    (
        '30000000-0000-0000-0000-000000000001',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'DEPOSIT',
        20000.0000,
        '2026-08-15 10:00:00+00',
        '{"source":"bank_transfer","bank_account":"BANK-100001"}',
        'TXN-IDEMP-0001'
    ),
    (
        '30000000-0000-0000-0000-000000000002',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'DEPOSIT',
        30000.0000,
        '2026-08-15 11:00:00+00',
        '{"source":"bank_transfer","bank_account":"BANK-100002"}',
        'TXN-IDEMP-0002'
    ),
    (
        '30000000-0000-0000-0000-000000000003',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'BUY_SETTLEMENT',
        4570.0000,
        '2026-08-18 15:00:00+00',
        '{"order_id":"10000000-0000-0000-0000-000000000001","ticker":"AAPL"}',
        'TXN-IDEMP-0003'
    ),
    (
        '30000000-0000-0000-0000-000000000004',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'BUY_SETTLEMENT',
        2771.2500,
        '2026-08-19 15:00:00+00',
        '{"order_id":"10000000-0000-0000-0000-000000000002","ticker":"NVDA"}',
        'TXN-IDEMP-0004'
    ),
    (
        '30000000-0000-0000-0000-000000000005',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'BUY_SETTLEMENT',
        5055.0000,
        '2026-08-19 15:30:00+00',
        '{"order_id":"10000000-0000-0000-0000-000000000003","ticker":"MSFT"}',
        'TXN-IDEMP-0005'
    ),
    (
        '30000000-0000-0000-0000-000000000006',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'BUY_SETTLEMENT',
        2736.0000,
        '2026-08-20 15:00:00+00',
        '{"order_id":"10000000-0000-0000-0000-000000000004","ticker":"TSLA"}',
        'TXN-IDEMP-0006'
    );


-- ============================================================
-- 10. WATCHLISTS
-- ============================================================

INSERT INTO Watchlist
    (watchlist_id, name, user_id)
VALUES
    (
        '40000000-0000-0000-0000-000000000001',
        'Technology Stocks',
        '11111111-1111-1111-1111-111111111111'
    ),
    (
        '40000000-0000-0000-0000-000000000002',
        'Growth Stocks',
        '22222222-2222-2222-2222-222222222222'
    );


-- ============================================================
-- 11. WATCHLIST ITEMS
-- ============================================================

INSERT INTO Watchlist_Items
    (item_id, watchlist_id, instrument_id)
VALUES
    (
        '50000000-0000-0000-0000-000000000001',
        '40000000-0000-0000-0000-000000000001',
        'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa'
    ),
    (
        '50000000-0000-0000-0000-000000000002',
        '40000000-0000-0000-0000-000000000001',
        'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb'
    ),
    (
        '50000000-0000-0000-0000-000000000003',
        '40000000-0000-0000-0000-000000000001',
        'cccccccc-3333-3333-3333-cccccccccccc'
    ),
    (
        '50000000-0000-0000-0000-000000000004',
        '40000000-0000-0000-0000-000000000002',
        'cccccccc-3333-3333-3333-cccccccccccc'
    ),
    (
        '50000000-0000-0000-0000-000000000005',
        '40000000-0000-0000-0000-000000000002',
        'eeeeeeee-5555-5555-5555-eeeeeeeeeeee'
    );


-- ============================================================
-- 12. NOTIFICATIONS
-- ============================================================

INSERT INTO Notifications
    (
        notification_id,
        user_id,
        payload,
        idempotency_key
    )
VALUES
    (
        '60000000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        '{"type":"TRADE_EXECUTED","message":"Your AAPL buy order was executed.","ticker":"AAPL","quantity":20}',
        'NOTIFY-IDEMP-0001'
    ),
    (
        '60000000-0000-0000-0000-000000000002',
        '11111111-1111-1111-1111-111111111111',
        '{"type":"TRADE_EXECUTED","message":"Your NVDA buy order was executed.","ticker":"NVDA","quantity":15}',
        'NOTIFY-IDEMP-0002'
    ),
    (
        '60000000-0000-0000-0000-000000000003',
        '22222222-2222-2222-2222-222222222222',
        '{"type":"TRADE_EXECUTED","message":"Your MSFT buy order was executed.","ticker":"MSFT","quantity":10}',
        'NOTIFY-IDEMP-0003'
    ),
    (
        '60000000-0000-0000-0000-000000000004',
        '22222222-2222-2222-2222-222222222222',
        '{"type":"TRADE_EXECUTED","message":"Your TSLA buy order was executed.","ticker":"TSLA","quantity":8}',
        'NOTIFY-IDEMP-0004'
    );




