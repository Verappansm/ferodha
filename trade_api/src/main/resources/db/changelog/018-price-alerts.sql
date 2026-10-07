--liquibase formatted sql

--changeset trade-api:020-watchlist-item-price-alerts
-- Add price alert columns to Watchlist_Items table
-- alert_price: the price threshold for the alert (nullable, so alerts can be removed)
-- alert_direction: 'ABOVE' or 'BELOW' - when the price goes above/below the threshold

ALTER TABLE Watchlist_Items
ADD COLUMN alert_price NUMERIC(18, 4) CHECK (alert_price IS NULL OR alert_price >= 0);

ALTER TABLE Watchlist_Items
ADD COLUMN alert_direction VARCHAR(10) CHECK (alert_direction IS NULL OR alert_direction IN ('ABOVE', 'BELOW'));

-- Create index for efficient alert checking
CREATE INDEX idx_watchlist_items_alerts ON Watchlist_Items(alert_price, alert_direction) WHERE alert_price IS NOT NULL;
--rollback DROP INDEX IF EXISTS idx_watchlist_items_alerts;
--rollback ALTER TABLE Watchlist_Items DROP COLUMN IF EXISTS alert_direction;
--rollback ALTER TABLE Watchlist_Items DROP COLUMN IF EXISTS alert_price;
