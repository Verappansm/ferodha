--liquibase formatted sql

-- LEAP-016: Market candles table for OHLC historical data
-- Stores 1-year daily candle data fetched from Fauxnance
-- CandlePersistenceScheduler (pricing_generator) calls Fauxnance API once/day
-- All candle queries go through trade-api REST endpoint backed by this table

--changeset trade-api:010-drop-market-data
-- Drop existing Market_Data table (unused, keyed by instrument_id UUID)
DROP INDEX IF EXISTS idx_market_data_lookup;
DROP TABLE IF EXISTS Market_Data CASCADE;
--rollback -- Cannot rollback: Market_Data was unused

--changeset trade-api:011-create-market-candles-table
CREATE TABLE market_candles (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    interval VARCHAR(10) NOT NULL,
    open NUMERIC(20, 8) NOT NULL,
    high NUMERIC(20, 8) NOT NULL,
    low NUMERIC(20, 8) NOT NULL,
    close NUMERIC(20, 8) NOT NULL,
    volume BIGINT,
    candle_time DATE NOT NULL,
    synthetic BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_candle UNIQUE(symbol, interval, candle_time),
    CONSTRAINT valid_ohlc CHECK (low <= open AND open <= high AND low <= close AND close <= high)
);
--rollback DROP TABLE IF EXISTS market_candles CASCADE;

--changeset trade-api:012-market-candles-indexes
CREATE INDEX idx_market_candles_symbol_interval
    ON market_candles(symbol, interval);

CREATE INDEX idx_market_candles_symbol_time
    ON market_candles(symbol, candle_time DESC);

CREATE INDEX idx_market_candles_interval_time
    ON market_candles(interval, candle_time DESC);
--rollback DROP INDEX IF EXISTS idx_market_candles_symbol_interval;
--rollback DROP INDEX IF EXISTS idx_market_candles_symbol_time;
--rollback DROP INDEX IF EXISTS idx_market_candles_interval_time;

--changeset trade-api:013-market-candles-updated-at-trigger splitStatements:false
CREATE OR REPLACE FUNCTION update_market_candles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_market_candles_updated_at
    BEFORE UPDATE ON market_candles
    FOR EACH ROW
    EXECUTE FUNCTION update_market_candles_updated_at();
--rollback DROP TRIGGER IF EXISTS trigger_market_candles_updated_at ON market_candles;
--rollback DROP FUNCTION IF EXISTS update_market_candles_updated_at();

--changeset trade-api:014-market-candles-upsert-function splitStatements:false
CREATE OR REPLACE FUNCTION upsert_candle(
    p_symbol VARCHAR,
    p_interval VARCHAR,
    p_open NUMERIC,
    p_high NUMERIC,
    p_low NUMERIC,
    p_close NUMERIC,
    p_volume BIGINT,
    p_candle_time DATE,
    p_synthetic BOOLEAN DEFAULT false
)
RETURNS void AS $$
BEGIN
    INSERT INTO market_candles (symbol, interval, open, high, low, close, volume, candle_time, synthetic)
    VALUES (p_symbol, p_interval, p_open, p_high, p_low, p_close, p_volume, p_candle_time, p_synthetic)
    ON CONFLICT (symbol, interval, candle_time)
    DO UPDATE SET
        open = EXCLUDED.open,
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        close = EXCLUDED.close,
        volume = EXCLUDED.volume,
        synthetic = EXCLUDED.synthetic,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;
--rollback DROP FUNCTION IF EXISTS upsert_candle(VARCHAR, VARCHAR, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BIGINT, DATE, BOOLEAN);
