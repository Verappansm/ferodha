-- Enums for constrained application states
CREATE TYPE user_status_enum AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED');
CREATE TYPE instrument_type_enum AS ENUM ('EQUITY', 'BOND', 'ETF', 'FOREX', 'CRYPTO' );
CREATE TYPE order_type_enum AS ENUM ('MARKET', 'LIMIT', 'STOP_LOSS', 'TAKE_PROFIT');
CREATE TYPE order_status_enum AS ENUM ('PENDING', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED');
CREATE TYPE order_side_enum AS ENUM ('BUY', 'SELL');
CREATE TYPE transaction_type_enum AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'BUY_SETTLEMENT', 'SELL_SETTLEMENT', 'DIVIDEND');

-- 1. Roles Table
CREATE TABLE Roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(30) NOT NULL UNIQUE
);

INSERT INTO Roles (role_name) VALUES ('client'), ('admin'), ('analyst'), ('advisor');

-- 2. Users Table
CREATE TABLE Users (
    user_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone_number VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL,
    status user_status_enum DEFAULT 'PENDING',
    role_id INT NOT NULL REFERENCES Roles(role_id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMPTZ
);

-- 3. Third-Party Bank Table (Simulated clearing house / external system)
CREATE TABLE Third_Party_Bank (
    bank_account_number VARCHAR(50) PRIMARY KEY,
    email VARCHAR(255) NOT NULL REFERENCES Users(email),
    pin_hash VARCHAR(255) NOT NULL,
    balance NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (balance >= 0)
);

-- 4. Accounts Table (Strictly for Clients)
CREATE TABLE Accounts (
    account_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
    advisor_id UUID REFERENCES Users(user_id) ON DELETE SET NULL,
    bank_account_number VARCHAR(50) NOT NULL REFERENCES Third_Party_Bank(bank_account_number),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    cash_balance NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (cash_balance >= 0),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Instruments Table
CREATE TABLE Instruments (
    instrument_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ticker VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    exchange VARCHAR(50) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    type instrument_type_enum NOT NULL,
    sector VARCHAR(50)
);

-- 6. Market Data Table
CREATE TABLE Market_Data (
    market_data_id BIGSERIAL PRIMARY KEY,
    instrument_id UUID NOT NULL REFERENCES Instruments(instrument_id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    open_price NUMERIC(18, 4) NOT NULL CHECK (open_price >= 0),
    close_price NUMERIC(18, 4) NOT NULL CHECK (close_price >= 0),
    high_price NUMERIC(18, 4) NOT NULL CHECK (high_price >= 0),
    low_price NUMERIC(18, 4) NOT NULL CHECK (low_price >= 0)
);

CREATE INDEX idx_market_data_lookup ON Market_Data (instrument_id, timestamp DESC);

-- Automated market data mapping helper function
CREATE OR REPLACE FUNCTION get_instrument_id_by_ticker(p_ticker VARCHAR)
RETURNS UUID AS $$
DECLARE
    v_instrument_id UUID;
BEGIN
    SELECT instrument_id INTO v_instrument_id FROM Instruments WHERE ticker = p_ticker;
    IF v_instrument_id IS NULL THEN
        RAISE EXCEPTION 'Ticker % not found in Instruments registry', p_ticker;
    END IF;
    RETURN v_instrument_id;
END;
$$ LANGUAGE plpgsql;

-- 7. Orders Table (checked)
CREATE TABLE Orders (
    order_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES Users(user_id) ON DELETE RESTRICT, -- Placer (Client or Advisor)
    account_id UUID NOT NULL REFERENCES Accounts(account_id) ON DELETE RESTRICT, -- Target Account
    instrument_id UUID NOT NULL REFERENCES Instruments(instrument_id) ON DELETE RESTRICT,
    side order_side_enum NOT NULL,
    order_type order_type_enum NOT NULL,
    limit_price NUMERIC(18, 4),
    quantity NUMERIC(18, 4) NOT NULL CHECK (quantity > 0),
    status order_status_enum DEFAULT 'PENDING',
    placed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. Trades Table (checked)
CREATE TABLE Trades (
    trade_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES Orders(order_id) ON DELETE RESTRICT,
    execution_price NUMERIC(18, 4) NOT NULL CHECK (execution_price > 0),
    execution_quantity NUMERIC(18, 4) NOT NULL CHECK (execution_quantity > 0),
    executed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 9. Transactions Table (checked)
CREATE TABLE Transactions (
    transaction_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES Accounts(account_id) ON DELETE CASCADE,
    transaction_type transaction_type_enum NOT NULL,
    amount NUMERIC(18, 4) NOT NULL,
    transaction_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

-- 10. Watchlist Table (checked)
CREATE TABLE Watchlist (
    watchlist_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    user_id UUID NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE
);

-- 11. Watchlist Items Table (checked)
CREATE TABLE Watchlist_Items (
    item_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    watchlist_id UUID NOT NULL REFERENCES Watchlist(watchlist_id) ON DELETE CASCADE,
    instrument_id UUID NOT NULL REFERENCES Instruments(instrument_id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_item_per_watchlist UNIQUE (watchlist_id, instrument_id)
);

-- 12. Notifications Table  (checked)
CREATE TABLE Notifications (
    notification_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 13. Dynamic Positions Calculation View
CREATE OR REPLACE VIEW Positions_View AS
WITH TradeExecutions AS (
    SELECT
        o.account_id,
        o.instrument_id,
        SUM(CASE WHEN o.side = 'BUY' THEN t.execution_quantity ELSE -t.execution_quantity END) AS total_quantity,
        SUM(CASE WHEN o.side = 'BUY' THEN t.execution_quantity * t.execution_price ELSE 0 END) AS total_buy_cost,
        SUM(CASE WHEN o.side = 'BUY' THEN t.execution_quantity ELSE 0 END) AS total_buy_qty
    FROM Trades t
    JOIN Orders o ON t.order_id = o.order_id
    GROUP BY o.account_id, o.instrument_id
),
LatestPrices AS (
    SELECT DISTINCT ON (instrument_id)
        instrument_id,
        close_price AS current_market_price
    FROM Market_Data
    ORDER BY instrument_id, timestamp DESC
)
SELECT
    gen_random_uuid() AS position_id,
    te.account_id,
    te.instrument_id,
    te.total_quantity AS quantity,
    CASE
        WHEN te.total_buy_qty > 0 THEN ROUND(te.total_buy_cost / te.total_buy_qty, 4)
        ELSE 0.0000
    END AS average_price,
    ROUND(te.total_quantity * lp.current_market_price, 4) AS market_value,
    ROUND((te.total_quantity * lp.current_market_price) - (te.total_quantity * (te.total_buy_cost / NULLIF(te.total_buy_qty, 0))), 4) AS unrealized_pnl_value,
    CASE
        WHEN te.total_buy_cost > 0 THEN
            ROUND((((te.total_quantity * lp.current_market_price) - (te.total_quantity * (te.total_buy_cost / te.total_buy_qty))) / (te.total_quantity * (te.total_buy_cost / te.total_buy_qty))) * 100, 2)
        ELSE 0.00
    END AS unrealized_pnl_percentage
FROM TradeExecutions te
JOIN LatestPrices lp ON te.instrument_id = lp.instrument_id
WHERE te.total_quantity <> 0;



-- ------------------ stuff i added
ALTER TABLE Notifications
ADD COLUMN idempotency_key VARCHAR(100) UNIQUE;

ALTER TABLE Trades
ADD COLUMN idempotency_key VARCHAR(100) UNIQUE;
-- Alternatively, use the broker's unique execution report ID:
-- ADD COLUMN execution_report_id VARCHAR(100) UNIQUE;


ALTER TABLE Transactions
ADD COLUMN idempotency_key VARCHAR(100) UNIQUE;




ALTER TABLE Orders
ADD COLUMN idempotency_key VARCHAR(100) UNIQUE;
