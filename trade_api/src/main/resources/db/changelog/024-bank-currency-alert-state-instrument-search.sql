--liquibase formatted sql

--changeset trade-api:024-bank-account-currency
-- A bank balance is money in one currency. Without the column, the same balance read as
-- USD under a USD trading account and as INR under an INR one, and a deposit moved it
-- across currencies one for one. The trading account now takes its bank's currency, and
-- a transfer between two different currencies is refused.
ALTER TABLE Third_Party_Bank ADD COLUMN IF NOT EXISTS currency VARCHAR(3);
UPDATE Third_Party_Bank b SET currency = a.currency
FROM Accounts a
WHERE a.bank_account_number = b.bank_account_number AND b.currency IS NULL;
UPDATE Third_Party_Bank SET currency = 'USD' WHERE currency IS NULL;
ALTER TABLE Third_Party_Bank ALTER COLUMN currency SET DEFAULT 'USD';
ALTER TABLE Third_Party_Bank ALTER COLUMN currency SET NOT NULL;
--rollback ALTER TABLE Third_Party_Bank DROP COLUMN IF EXISTS currency;

--changeset trade-api:024-watchlist-alert-state
-- LEAP-007: an alert has a state the customer can see. ACTIVE until a quote crosses it,
-- then TRIGGERED (once, by a guarded update), or CANCELLED by the customer. Setting or
-- changing an alert arms it again with a new armed_at, which also names the notification
-- it raises, so a re-armed alert at the same price can fire again.
ALTER TABLE Watchlist_Items ADD COLUMN IF NOT EXISTS alert_status VARCHAR(10)
    CHECK (alert_status IS NULL OR alert_status IN ('ACTIVE', 'TRIGGERED', 'CANCELLED'));
ALTER TABLE Watchlist_Items ADD COLUMN IF NOT EXISTS alert_armed_at TIMESTAMPTZ;
ALTER TABLE Watchlist_Items ADD COLUMN IF NOT EXISTS alert_triggered_at TIMESTAMPTZ;
ALTER TABLE Watchlist_Items ADD COLUMN IF NOT EXISTS alert_triggered_price NUMERIC(18, 4);
UPDATE Watchlist_Items SET alert_status = 'ACTIVE', alert_armed_at = now()
WHERE alert_price IS NOT NULL AND alert_direction IS NOT NULL AND alert_status IS NULL;
CREATE INDEX IF NOT EXISTS idx_watchlist_items_active_alerts
    ON Watchlist_Items (instrument_id) WHERE alert_status = 'ACTIVE';
--rollback DROP INDEX IF EXISTS idx_watchlist_items_active_alerts;
--rollback ALTER TABLE Watchlist_Items DROP COLUMN IF EXISTS alert_triggered_price, DROP COLUMN IF EXISTS alert_triggered_at, DROP COLUMN IF EXISTS alert_armed_at, DROP COLUMN IF EXISTS alert_status;

--changeset trade-api:024-instrument-search-indexes
-- LEAP-015: a text search matches part of a ticker or a name, case-insensitively. Trigram
-- indexes serve a LIKE '%text%' search without scanning the table (pg_trgm is a trusted
-- extension, so the application's own role may create it).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_instruments_ticker_trgm ON Instruments USING gin (lower(ticker) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_instruments_name_trgm ON Instruments USING gin (lower(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_instruments_filters ON Instruments (exchange, sector, type) WHERE tradable;
--rollback DROP INDEX IF EXISTS idx_instruments_filters; DROP INDEX IF EXISTS idx_instruments_name_trgm; DROP INDEX IF EXISTS idx_instruments_ticker_trgm;
