--liquibase formatted sql

--changeset trade-api:022-notification-price-alert-type runInTransaction:false
-- Watchlist price alerts are notifications too; they were the one thing the module could not hold.
ALTER TYPE notification_event_type_enum ADD VALUE IF NOT EXISTS 'PRICE_ALERT';
--rollback SELECT 1;

--changeset trade-api:022-drop-notification-preferences
-- The delivery channel lives in the customer's Settings (pref_customer_preference); a second
-- table holding the same choice could only disagree with it.
DROP TABLE IF EXISTS notification_preferences;
--rollback SELECT 1;
