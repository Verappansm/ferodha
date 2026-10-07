--liquibase formatted sql

--changeset trade-api:020-legacy-notifications-rename
--preconditions onFail:MARK_RAN
--precondition-sql-check expectedResult:1 SELECT count(*) FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'notifications' AND column_name = 'payload'
-- The Sprint 3 Notifications table (user_id, payload) shares its name with the
-- notifications module's table (changelog 016), so on a database that already has
-- the old one, 016 would fail with "relation already exists". Move the old one
-- aside instead of dropping it: its rows are kept.
ALTER TABLE Notifications RENAME TO legacy_notifications;
--rollback ALTER TABLE legacy_notifications RENAME TO Notifications;

--changeset trade-api:020-legacy-notifications-create
-- Where watchlist price alerts are written (they are not order events, so the
-- module's table, whose event type is an ORDER_* value, does not fit them). On a
-- database made after the base schema dropped Notifications it does not exist yet.
CREATE TABLE IF NOT EXISTS legacy_notifications (
    notification_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    idempotency_key VARCHAR(100) UNIQUE
);
--rollback SELECT 1;
