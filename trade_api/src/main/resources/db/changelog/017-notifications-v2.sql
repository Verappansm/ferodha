--liquibase formatted sql

-- Clean up and recreate notification schema (handles duplicate tables from previous runs)
-- This migration has UNIQUE changeset IDs and will run after 016-notifications.sql

--changeset trade-api:026-cleanup-notification-tables
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS notification_preferences CASCADE;
--rollback SELECT 1;

--changeset trade-api:027-cleanup-notification-types
DROP TYPE IF EXISTS notification_event_type_enum CASCADE;
DROP TYPE IF EXISTS notification_status_enum CASCADE;
DROP TYPE IF EXISTS notification_channel_enum CASCADE;
--rollback SELECT 1;

--changeset trade-api:028-recreate-notification-channel-enum
CREATE TYPE notification_channel_enum AS ENUM ('EMAIL', 'IN_APP');
--rollback DROP TYPE notification_channel_enum;

--changeset trade-api:029-recreate-notification-status-enum
CREATE TYPE notification_status_enum AS ENUM ('QUEUED', 'SENT', 'FAILED', 'RETRYING');
--rollback DROP TYPE notification_status_enum;

--changeset trade-api:030-recreate-notification-event-type-enum
CREATE TYPE notification_event_type_enum AS ENUM ('ORDER_FILLED', 'ORDER_REJECTED', 'ORDER_CANCELLED');
--rollback DROP TYPE notification_event_type_enum;

--changeset trade-api:031-recreate-notification-preferences-table
CREATE TABLE notification_preferences (
    account_id BIGINT PRIMARY KEY NOT NULL REFERENCES Accounts(id),
    notification_channel notification_channel_enum NOT NULL DEFAULT 'IN_APP',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notification_preferences_account ON notification_preferences(account_id);
--rollback DROP TABLE notification_preferences CASCADE;

--changeset trade-api:032-recreate-notifications-table
CREATE TABLE notifications (
    notification_id UUID PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES Accounts(id),
    event_id UUID NOT NULL UNIQUE,
    event_type notification_event_type_enum NOT NULL,
    order_id VARCHAR(64),
    symbol VARCHAR(10),
    resolved_channel notification_channel_enum NOT NULL,
    message TEXT NOT NULL,
    status notification_status_enum NOT NULL DEFAULT 'QUEUED',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_account ON notifications(account_id);
CREATE INDEX idx_notifications_event_id ON notifications(event_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX idx_notifications_account_created ON notifications(account_id, created_at DESC);
--rollback DROP TABLE notifications CASCADE;
