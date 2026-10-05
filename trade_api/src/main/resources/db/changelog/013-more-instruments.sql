--liquibase formatted sql

-- More tradable instruments: the market list, search and pricing cover
-- whatever is in Instruments, so these become searchable, priced by
-- pricing_generator and tradable as soon as this runs. A ticker already
-- present is left as it is.

--changeset trade-api:017-more-instruments
INSERT INTO Instruments (ticker, name, exchange, currency, type, sector) VALUES
    ('AMD',  'Advanced Micro Devices, Inc.',                'NASDAQ',    'USD', 'EQUITY', 'Technology'),
    ('AMZN', 'Amazon.com, Inc.',                            'NASDAQ',    'USD', 'EQUITY', 'Consumer Discretionary'),
    ('ARM',  'Arm Holdings plc',                            'NASDAQ',    'USD', 'EQUITY', 'Technology'),
    ('AVGO', 'Broadcom Inc.',                               'NASDAQ',    'USD', 'EQUITY', 'Technology'),
    ('CRWD', 'CrowdStrike Holdings, Inc.',                  'NASDAQ',    'USD', 'EQUITY', 'Technology'),
    ('HPE',  'Hewlett Packard Enterprise Company',          'NYSE',      'USD', 'EQUITY', 'Technology'),
    ('INTC', 'Intel Corporation',                           'NASDAQ',    'USD', 'EQUITY', 'Technology'),
    ('IWM',  'iShares Russell 2000 ETF',                    'NYSE ARCA', 'USD', 'ETF',    'Index'),
    ('LITE', 'Lumentum Holdings Inc.',                      'NASDAQ',    'USD', 'EQUITY', 'Technology'),
    ('META', 'Meta Platforms, Inc.',                        'NASDAQ',    'USD', 'EQUITY', 'Communication Services'),
    ('MRVL', 'Marvell Technology, Inc.',                    'NASDAQ',    'USD', 'EQUITY', 'Technology'),
    ('MSTR', 'Strategy Incorporated',                       'NASDAQ',    'USD', 'EQUITY', 'Technology'),
    ('MU',   'Micron Technology, Inc.',                     'NASDAQ',    'USD', 'EQUITY', 'Technology'),
    ('NFLX', 'Netflix, Inc.',                               'NASDAQ',    'USD', 'EQUITY', 'Communication Services'),
    ('PLTR', 'Palantir Technologies Inc.',                  'NASDAQ',    'USD', 'EQUITY', 'Technology'),
    ('SMCI', 'Super Micro Computer, Inc.',                  'NASDAQ',    'USD', 'EQUITY', 'Technology'),
    ('SNDK', 'Sandisk Corporation',                         'NASDAQ',    'USD', 'EQUITY', 'Technology'),
    ('SOXL', 'Direxion Daily Semiconductor Bull 3X Shares', 'NYSE ARCA', 'USD', 'ETF',    'Technology'),
    ('SOXX', 'iShares Semiconductor ETF',                   'NASDAQ',    'USD', 'ETF',    'Technology'),
    ('XLE',  'Energy Select Sector SPDR Fund',              'NYSE ARCA', 'USD', 'ETF',    'Energy')
ON CONFLICT (ticker) DO NOTHING;
--rollback DELETE FROM Instruments WHERE ticker IN ('AMD', 'AMZN', 'ARM', 'AVGO', 'CRWD', 'HPE', 'INTC', 'IWM', 'LITE', 'META', 'MRVL', 'MSTR', 'MU', 'NFLX', 'PLTR', 'SMCI', 'SNDK', 'SOXL', 'SOXX', 'XLE');

-- The market-maker's holdings, as changeset 004 gave the instruments that
-- existed then: one large historical BUY per tradable instrument it holds
-- nothing of yet, so its resting SELL side passes the holdings re-check
-- under market-sim.
--changeset trade-api:018-market-maker-holdings-for-new-instruments
INSERT INTO Orders (user_id, account_id, instrument_id, side, order_type, limit_price, quantity,
                     status, placed_at, executed_price, executed_on, source, filled_quantity, idempotency_key)
SELECT '99999999-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000002', i.instrument_id,
       'BUY'::order_side_enum, 'LIMIT'::order_type_enum, 1.0000, 1000000,
       'FILLED'::order_status_enum, now(), 1.0000, now(), 'RANDOMIZER', 1000000, 'SEED-MM-' || i.ticker
FROM Instruments i
WHERE i.tradable = true
  AND NOT EXISTS (SELECT 1 FROM Orders o WHERE o.idempotency_key = 'SEED-MM-' || i.ticker);
INSERT INTO Trades (order_id, execution_price, execution_quantity)
SELECT o.order_id, 1.0000, 1000000
FROM Orders o
WHERE o.account_id = '99999999-0000-0000-0000-000000000002'
  AND o.idempotency_key LIKE 'SEED-MM-%'
  AND NOT EXISTS (SELECT 1 FROM Trades t WHERE t.order_id = o.order_id);
--rollback DELETE FROM Trades WHERE order_id IN (SELECT order_id FROM Orders WHERE idempotency_key IN ('SEED-MM-AMD', 'SEED-MM-AMZN', 'SEED-MM-ARM', 'SEED-MM-AVGO', 'SEED-MM-CRWD', 'SEED-MM-HPE', 'SEED-MM-INTC', 'SEED-MM-IWM', 'SEED-MM-LITE', 'SEED-MM-META', 'SEED-MM-MRVL', 'SEED-MM-MSTR', 'SEED-MM-MU', 'SEED-MM-NFLX', 'SEED-MM-PLTR', 'SEED-MM-SMCI', 'SEED-MM-SNDK', 'SEED-MM-SOXL', 'SEED-MM-SOXX', 'SEED-MM-XLE'));
--rollback DELETE FROM Orders WHERE idempotency_key IN ('SEED-MM-AMD', 'SEED-MM-AMZN', 'SEED-MM-ARM', 'SEED-MM-AVGO', 'SEED-MM-CRWD', 'SEED-MM-HPE', 'SEED-MM-INTC', 'SEED-MM-IWM', 'SEED-MM-LITE', 'SEED-MM-META', 'SEED-MM-MRVL', 'SEED-MM-MSTR', 'SEED-MM-MU', 'SEED-MM-NFLX', 'SEED-MM-PLTR', 'SEED-MM-SMCI', 'SEED-MM-SNDK', 'SEED-MM-SOXL', 'SEED-MM-SOXX', 'SEED-MM-XLE');
