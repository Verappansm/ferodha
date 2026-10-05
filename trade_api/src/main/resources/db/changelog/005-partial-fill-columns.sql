--liquibase formatted sql

-- Re-introduces PARTIALLY_FILLED (002-order-status-alignment.sql removed it
-- as unused at the time) and the two columns a matching engine needs that
-- fill-or-reject never did: who originated the order, and how much of it
-- has actually executed so far. Both new columns are additive with safe
-- defaults - every order placed before this migration is implicitly a
-- fully-portal, zero-filled-so-far order, which is exactly what NEW/FILLED/
-- REJECTED/CANCELLED rows already are.

-- Postgres allows adding an enum literal without rebuilding the type (unlike
-- removing one, which 002 already documents as the hard direction). The new
-- value isn't referenced by this same changeset, so the usual
-- can't-use-a-brand-new-enum-value-in-the-transaction-that-added-it
-- restriction doesn't apply here.
--changeset trade-api:001-orders-status-partially-filled
ALTER TYPE order_status_enum ADD VALUE 'PARTIALLY_FILLED';

--changeset trade-api:002-orders-source
ALTER TABLE Orders ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'PORTAL';
--rollback ALTER TABLE Orders DROP COLUMN source;

--changeset trade-api:003-orders-filled-quantity
ALTER TABLE Orders ADD COLUMN filled_quantity INTEGER NOT NULL DEFAULT 0;
--rollback ALTER TABLE Orders DROP COLUMN filled_quantity;
