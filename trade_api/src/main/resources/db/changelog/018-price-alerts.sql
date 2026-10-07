--liquibase formatted sql

-- Price alerts on a watchlist item: alert_price is the threshold (NULL means no
-- alert) and alert_direction says whether it fires when the price goes ABOVE or
-- BELOW it. Written to be safe on any database: IF NOT EXISTS, so a database
-- that already has the columns (one that had them added by hand) is left as it
-- is instead of failing the whole start-up.

--changeset trade-api:001-watchlist-item-price-alerts
ALTER TABLE Watchlist_Items
    ADD COLUMN IF NOT EXISTS alert_price NUMERIC(18, 4) CHECK (alert_price IS NULL OR alert_price >= 0);
ALTER TABLE Watchlist_Items
    ADD COLUMN IF NOT EXISTS alert_direction VARCHAR(10) CHECK (alert_direction IS NULL OR alert_direction IN ('ABOVE', 'BELOW'));
CREATE INDEX IF NOT EXISTS idx_watchlist_items_alerts
    ON Watchlist_Items (alert_price, alert_direction) WHERE alert_price IS NOT NULL;
--rollback DROP INDEX IF EXISTS idx_watchlist_items_alerts;
--rollback ALTER TABLE Watchlist_Items DROP COLUMN IF EXISTS alert_direction, DROP COLUMN IF EXISTS alert_price;
