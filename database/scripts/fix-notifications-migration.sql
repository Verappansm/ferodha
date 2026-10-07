-- Fix Liquibase migration conflict for notifications tables
-- This script drops conflicting notification tables and enums so Liquibase can recreate them cleanly

-- Drop dependent objects first (foreign keys, indexes)
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS notification_preferences CASCADE;

-- Drop enums
DROP TYPE IF EXISTS notification_status_enum CASCADE;
DROP TYPE IF EXISTS notification_event_type_enum CASCADE;
DROP TYPE IF EXISTS notification_channel_enum CASCADE;

-- Remove the failed changesets from Liquibase tracking so they'll run again
DELETE FROM databasechangelog
WHERE id IN ('001-notification-channel-enum', '002-notification-status-enum', '003-notification-event-type-enum', '004-notification-preferences-table', '005-notifications-table')
AND author = 'trade-api'
AND filename = 'db/changelog/016-notifications.sql';

-- Verify the cleanup
SELECT COUNT(*) as remaining_notification_changesets
FROM databasechangelog
WHERE author = 'trade-api'
AND filename = 'db/changelog/016-notifications.sql';
