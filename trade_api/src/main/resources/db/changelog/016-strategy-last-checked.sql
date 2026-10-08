--liquibase formatted sql

-- When a strategy last looked at a price, so the customer can see it is alive
-- and what it is watching (strategies.last_price already holds the price).

--changeset trade-api:001-strategies-last-checked-at
ALTER TABLE strategies ADD COLUMN last_checked_at TIMESTAMPTZ;
--rollback ALTER TABLE strategies DROP COLUMN last_checked_at;
