--liquibase formatted sql

--changeset trade-api:023-notification-read-at
-- When the customer read it in the app; null while unread. Drives the bell's count.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (account_id) WHERE read_at IS NULL;
--rollback ALTER TABLE notifications DROP COLUMN read_at;

--changeset trade-api:023-legacy-notifications-into-module
-- The Sprint 3 notifications (and the price alerts written before the module took them over)
-- become ordinary rows of the module's table, so the customer sees them in the app. A row
-- whose user has no account has nobody to show it to and is not copied. The old table is
-- dropped afterwards: nothing reads it any more.
INSERT INTO notifications (notification_id, account_id, event_id, event_type, symbol, resolved_channel,
                           message, status, created_at, updated_at, read_at)
SELECT ln.notification_id,
       a.id,
       ln.notification_id,
       (CASE WHEN ln.payload ->> 'type' = 'PRICE_ALERT' THEN 'PRICE_ALERT' ELSE 'ORDER_FILLED' END)::notification_event_type_enum,
       LEFT(ln.payload ->> 'ticker', 10),
       'IN_APP'::notification_channel_enum,
       COALESCE(ln.payload ->> 'message', 'Notification'),
       'SENT'::notification_status_enum,
       COALESCE(ln.created_at, now()),
       COALESCE(ln.created_at, now()),
       CASE WHEN ln.payload ->> 'read' = 'true' THEN COALESCE(ln.created_at, now()) END
FROM legacy_notifications ln
         JOIN LATERAL (SELECT id FROM Accounts WHERE user_id = ln.user_id ORDER BY id LIMIT 1) a ON TRUE
ON CONFLICT DO NOTHING;
DROP TABLE IF EXISTS legacy_notifications;
--rollback SELECT 1;
