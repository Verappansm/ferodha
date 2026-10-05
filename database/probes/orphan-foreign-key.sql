-- This deliberately references a nonexistent parent. Since `Orders.account_id` references `Accounts(account_id)`, the second statement should produce **SQLSTATE `23503`**.
--- sql id="39164"
-- probes/orphan-foreign-key.sql

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
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    (SELECT instrument_id FROM Instruments LIMIT 1),
    'BUY',
    'MARKET',
    10.0000,
    'PENDING',
    'HARNESS-ORPHAN-FK-KEY'
);
