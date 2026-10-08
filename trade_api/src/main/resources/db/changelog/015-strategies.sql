--liquibase formatted sql

-- Automated strategy execution. A strategy is one rule a customer configures
-- once: BUY when the ask falls through a level, or SELL when the bid rises
-- through one. Everything that bounds the damage lives on the row, so the
-- engine reads its limits from the same place it reads its state.

--changeset trade-api:001-strategies
CREATE TABLE strategies (
    strategy_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID          NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
    account_id           BIGINT        NOT NULL,
    name                 VARCHAR(60)   NOT NULL,
    symbol               VARCHAR(20)   NOT NULL,
    side                 VARCHAR(4)    NOT NULL CHECK (side IN ('BUY', 'SELL')),
    trigger_price        NUMERIC(18,2) NOT NULL CHECK (trigger_price > 0),
    quantity             INT           NOT NULL CHECK (quantity > 0),
    -- BUY only: the most the strategy may commit in total, fees included
    max_spend            NUMERIC(18,2) CHECK (max_spend > 0),
    -- BUY only: the most units the account may hold, pending buys included
    max_position         INT           CHECK (max_position > 0),
    max_orders           INT           NOT NULL DEFAULT 1 CHECK (max_orders > 0),
    max_failures         INT           NOT NULL DEFAULT 3 CHECK (max_failures > 0),
    dry_run              BOOLEAN       NOT NULL DEFAULT false,
    -- DISABLED is the starting state: nothing trades until the customer enables it
    status               VARCHAR(10)   NOT NULL DEFAULT 'DISABLED'
                         CHECK (status IN ('DISABLED', 'ENABLED', 'TRIPPED', 'COMPLETED', 'EXPIRED')),
    orders_placed        INT           NOT NULL DEFAULT 0,
    consecutive_failures INT           NOT NULL DEFAULT 0,
    -- the previous observed price: a crossing needs a before and an after
    last_price           NUMERIC(18,4),
    expires_at           TIMESTAMPTZ,
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_strategies_enabled_symbol ON strategies (symbol) WHERE status = 'ENABLED';
CREATE INDEX idx_strategies_account ON strategies (account_id);
--rollback DROP TABLE strategies;

--changeset trade-api:002-strategy-events
CREATE TABLE strategy_events (
    event_id    BIGSERIAL PRIMARY KEY,
    strategy_id UUID         NOT NULL REFERENCES strategies(strategy_id) ON DELETE CASCADE,
    occurred_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    kind        VARCHAR(20)  NOT NULL,
    detail      VARCHAR(300)
);
CREATE INDEX idx_strategy_events_strategy ON strategy_events (strategy_id, event_id DESC);
--rollback DROP TABLE strategy_events;

-- Which strategy placed an order. NULL for every order a customer placed
-- themselves.
--changeset trade-api:003-orders-strategy-id
ALTER TABLE Orders ADD COLUMN strategy_id UUID REFERENCES strategies(strategy_id);
CREATE INDEX idx_orders_strategy ON Orders (strategy_id) WHERE strategy_id IS NOT NULL;
--rollback ALTER TABLE Orders DROP COLUMN strategy_id;
