--liquibase formatted sql

-- LEAP-016: one-minute bars behind the instrument page's 1D chart.
-- Fauxnance candles are end-of-day only (market_candles, changelog 010), so
-- the intraday history comes from pricing_generator's own ticks: it folds
-- every tick into the bar of its minute and deletes bars after
-- GENERATOR_BAR_RETENTION_HOURS (default 26). Also the portfolio's price of
-- last resort when a symbol has no quote on market-data yet.

--changeset trade-api:015-market-bars
CREATE TABLE market_bars (
    symbol     VARCHAR(20)    NOT NULL,
    bar_start  TIMESTAMPTZ    NOT NULL,
    open       NUMERIC(20, 8) NOT NULL,
    high       NUMERIC(20, 8) NOT NULL,
    low        NUMERIC(20, 8) NOT NULL,
    close      NUMERIC(20, 8) NOT NULL,
    PRIMARY KEY (symbol, bar_start)
);
CREATE INDEX idx_market_bars_bar_start ON market_bars (bar_start);
--rollback DROP TABLE market_bars;
