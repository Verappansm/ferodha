--liquibase formatted sql

-- The commission rate an order is charged at (LEAP-017). trade_api writes it
-- from its fee.rate when it accepts the order, the same rate the order ticket's
-- review showed; trade_executor charges every fill of the order at it, so the
-- rate lives in one place and an order resting in the book keeps the rate it
-- was accepted at.
--
-- The default 0 covers rows trade_api does not write: trades_generator's
-- market-maker orders and the Liquibase seed orders pay no commission.

--changeset trade-api:001-orders-fee-rate
ALTER TABLE Orders ADD COLUMN fee_rate NUMERIC(10, 6) NOT NULL DEFAULT 0;
--rollback ALTER TABLE Orders DROP COLUMN fee_rate;

-- Portal orders that already exist were placed under the executor's old
-- default rate; an open one must still be charged at it when it fills.
--changeset trade-api:002-orders-fee-rate-backfill
UPDATE Orders SET fee_rate = 0.001 WHERE source = 'PORTAL';
