--liquibase formatted sql

-- Records when Kafka acknowledged an order's ORDER_PLACED event. The order row
-- commits before the event is sent, so a broker that is down at that moment
-- used to leave the order NEW for ever with nothing ever reading it.
-- UnpublishedOrderSweeper re-sends any portal order still NEW and unpublished
-- after a grace period; the executor only acts on an order that is still NEW,
-- so a second copy of an event that did get through changes nothing.

--changeset trade-api:001-orders-published-at
ALTER TABLE Orders ADD COLUMN published_at TIMESTAMPTZ;
--rollback ALTER TABLE Orders DROP COLUMN published_at;

-- Every order that exists before this column did was either published or is
-- long settled; treat them all as published so the sweeper never replays
-- history.
--changeset trade-api:002-orders-published-at-backfill
UPDATE Orders SET published_at = placed_at WHERE published_at IS NULL;

-- The sweeper's query: only NEW portal orders not yet acknowledged.
--changeset trade-api:003-orders-unpublished-index
CREATE INDEX idx_orders_unpublished ON Orders (placed_at)
    WHERE status = 'NEW' AND published_at IS NULL;
--rollback DROP INDEX idx_orders_unpublished;
