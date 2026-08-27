-- probes/duplicate-idempotency-key.sql

-- First insert: valid order
INSERT INTO Orders (
    order_id,
    user_id,
    account_id,
    instrument_id,
    side,
    order_type,
    quantity,
    status,
    idempotency_key
)
VALUES (
    gen_random_uuid(),
    (SELECT user_id FROM Users LIMIT 1),
    (SELECT account_id FROM Accounts LIMIT 1),
    (SELECT instrument_id FROM Instruments LIMIT 1),
    'BUY',
    'MARKET',
    10.0000,
    'PENDING',
    'HARNESS-DUPLICATE-IDEMPOTENCY-KEY'
);

-- Second insert: intentionally violates UNIQUE(idempotency_key)
-- Expected SQLSTATE: 23505
INSERT INTO Orders (
    order_id,
    user_id,
    account_id,
    instrument_id,
    side,
    order_type,
    quantity,
    status,
    idempotency_key
)
VALUES (
    gen_random_uuid(),
    (SELECT user_id FROM Users LIMIT 1),
    (SELECT account_id FROM Accounts LIMIT 1),
    (SELECT instrument_id FROM Instruments LIMIT 1),
    'BUY',
    'MARKET',
    10.0000,
    'PENDING',
    'HARNESS-DUPLICATE-IDEMPOTENCY-KEY'
);