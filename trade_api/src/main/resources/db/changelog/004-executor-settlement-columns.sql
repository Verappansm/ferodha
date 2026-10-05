--liquibase formatted sql

-- Sprint 7's Trade Executor resolves every order it consumes to a terminal
-- state (FILLED or REJECTED) and needs three things Sprint 3/6's schema
-- doesn't have yet: why a REJECTED order was rejected, when the executor
-- resolved the order, and how much fee a FILLED order was charged. All
-- three are additive, nullable columns - NEW/CANCELLED orders never
-- populate any of them, and existing rows are unaffected.

--changeset trade-api:001-orders-rejection-reason
ALTER TABLE Orders ADD COLUMN rejection_reason VARCHAR(40);
--rollback ALTER TABLE Orders DROP COLUMN rejection_reason;

--changeset trade-api:002-orders-executed-on
ALTER TABLE Orders ADD COLUMN executed_on TIMESTAMPTZ;
--rollback ALTER TABLE Orders DROP COLUMN executed_on;

-- Mirrors executed_price's own nullability: populated on FILLED only.
--changeset trade-api:003-orders-fee-amount
ALTER TABLE Orders ADD COLUMN fee_amount NUMERIC(18, 4);
--rollback ALTER TABLE Orders DROP COLUMN fee_amount;
