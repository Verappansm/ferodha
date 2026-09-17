--liquibase formatted sql

-- contracts/trade-api.yaml fixes OrderStatus to exactly NEW, FILLED,
-- REJECTED, CANCELLED. Sprint 3's order_status_enum instead had PENDING and
-- PARTIALLY_FILLED (no PARTIALLY_FILLED literal exists in the contract - the
-- Trade Executor either fills an order in full or rejects it), so the type
-- is rebuilt here rather than patched: Postgres cannot rename an enum
-- literal it needs to remove in place, only add ones.
--
-- PENDING is the only value 001_seed_data.sql actually uses and it means
-- exactly what NEW means - a working order, not yet resolved - so that is
-- the only data migration this needs. PARTIALLY_FILLED is handled defensively
-- in case a later manual insert ever used it.

--changeset trade-api:001-orders-status-to-text runInTransaction:true
ALTER TABLE Orders ALTER COLUMN status DROP DEFAULT;
ALTER TABLE Orders ALTER COLUMN status TYPE VARCHAR(20) USING status::text;
DROP TYPE order_status_enum;

--changeset trade-api:002-orders-status-backfill
UPDATE Orders SET status = 'NEW' WHERE status = 'PENDING';
UPDATE Orders SET status = 'FILLED' WHERE status = 'PARTIALLY_FILLED';

--changeset trade-api:003-orders-status-recreate-enum
CREATE TYPE order_status_enum AS ENUM ('NEW', 'FILLED', 'REJECTED', 'CANCELLED');
ALTER TABLE Orders ALTER COLUMN status TYPE order_status_enum USING status::order_status_enum;
ALTER TABLE Orders ALTER COLUMN status SET DEFAULT 'NEW';
--rollback -- not reversible: the original enum's literals are not reconstructed

-- OrderHistoryEntry.executedPrice - the price the order actually filled at,
-- null until FILLED. Sprint 6 fills synchronously in the same request that
-- creates the order, so it is written once, alongside the order row, rather
-- than requiring a join out to Trades on every read.
--changeset trade-api:004-orders-executed-price
ALTER TABLE Orders ADD COLUMN executed_price NUMERIC(18, 4);
--rollback ALTER TABLE Orders DROP COLUMN executed_price;
