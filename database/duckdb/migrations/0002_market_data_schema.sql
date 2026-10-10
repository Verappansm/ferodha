-- Sprint 4: Fauxnance daily candles (etl_pipeline), one row per symbol and day.
-- Written by etl_pipeline.load; read by the claims dashboard.
CREATE TABLE IF NOT EXISTS real_market_data (
    symbol    VARCHAR,
    date      DATE,
    open      DOUBLE,
    high      DOUBLE,
    low       DOUBLE,
    close     DOUBLE,
    adjclose  DOUBLE,
    volume    BIGINT,
    currency  VARCHAR,
    interval  VARCHAR,
    daily_return DOUBLE,
    trade_value  DOUBLE,
    PRIMARY KEY (symbol, date)
);
