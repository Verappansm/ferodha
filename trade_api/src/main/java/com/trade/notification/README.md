# Customer Notifications Module

## Overview

The Customer Notifications module delivers notifications to customers on their elected channel (EMAIL or IN_APP) when:
- Orders are filled, rejected, or cancelled
- Watchlist price thresholds are reached
- Other system events occur (extensible)

Notifications are:
- **Durable**: Recorded in the database before delivery is attempted
- **Idempotent**: A replayed Kafka event produces no second notification
- **Owner-only**: Customers can only read their own notification history
- **Channel-aware**: The channel is resolved from customer preferences and recorded on every notification

## Architecture

### Package Structure

```
com.trade.notification/
├── controller/
│   ├── NotificationPreferenceController     # GET/PATCH preferences
│   └── NotificationController               # GET/POST notifications, internal endpoints
├── service/
│   ├── NotificationPreferenceService        # Preference management
│   └── NotificationService                  # Notification business logic
├── domain/
│   ├── Notification                         # Domain model
│   ├── NotificationPreference               # Preference model
│   ├── NotificationRepository               # Repository interface
│   ├── NotificationRepositoryImpl            # Repository implementation
│   ├── NotificationPreferenceRepository     # Preference repository interface
│   └── NotificationPreferenceRepositoryImpl  # Preference repository implementation
├── mapper/
│   ├── NotificationMapper                   # MyBatis mapper
│   └── NotificationPreferenceMapper         # MyBatis mapper
├── dto/
│   ├── NotificationResponseDto              # API response
│   ├── NotificationPreferencesResponseDto   # Preference response
│   ├── RecordNotificationRequestDto         # Record request (Kafka consumer)
│   ├── SendWatchlistAlertRequestDto         # Watchlist alert
│   ├── UpdateNotificationStatusRequestDto   # Status update
│   └── UpdateNotificationPreferencesRequestDto  # Preference update
├── enums/
│   ├── NotificationChannel                  # EMAIL, IN_APP
│   ├── NotificationStatus                   # QUEUED, SENT, FAILED, RETRYING
│   └── NotificationEventType                # ORDER_FILLED, ORDER_REJECTED, ORDER_CANCELLED
├── event/
│   └── TradeEventNotificationListener       # Kafka consumer for trade-events
└── exception/
    └── PreferencesNotFoundException          # Thrown when preferences not found
```

### API Endpoints

#### Customer-Facing Routes (require JWT)

- `GET /api/v1/notification-preferences` - Get current channel preference
- `PATCH /api/v1/notification-preferences` - Update channel preference
- `GET /api/v1/notifications` - Paginated notification history (owner-only)
- `GET /api/v1/notifications/{notificationId}` - Single notification (owner-only)
- `POST /api/v1/notifications/watchlist/alert` - Trigger watchlist alert

#### Internal Routes (Kafka consumer)

- `POST /api/v1/notifications/internal/record` - Record notification from trade event
- `PATCH /api/v1/notifications/internal/{notificationId}/status` - Update delivery status

### Database Schema

**notification_preferences**
```sql
CREATE TABLE notification_preferences (
    account_id BIGINT PRIMARY KEY,
    notification_channel notification_channel_enum (EMAIL, IN_APP),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

**notifications**
```sql
CREATE TABLE notifications (
    notification_id UUID PRIMARY KEY,
    account_id BIGINT NOT NULL,
    event_id UUID NOT NULL UNIQUE,
    event_type notification_event_type_enum,
    order_id VARCHAR(64),
    symbol VARCHAR(10),
    resolved_channel notification_channel_enum,
    message TEXT,
    status notification_status_enum (QUEUED, SENT, FAILED, RETRYING),
    error_message TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

## Notification Lifecycle

### From Kafka (Trade Events)

1. **Trade Executor publishes** `ORDER_FILLED`, `ORDER_REJECTED`, or `ORDER_CANCELLED` to `trade-events` topic
2. **Notification consumer** (`TradeEventNotificationListener`) receives event
3. **Resolve channel** from `notification-preferences` table
4. **Record notification** in `notifications` table with status `QUEUED`
5. **Commit Kafka offset** after step 4 succeeds
6. **Asynchronous sender** (future implementation) picks up `QUEUED` notifications and sends via channel
7. **Update status** to `SENT` or `FAILED` with optional error message

### From Watchlist Feature

1. **Watchlist component** calls `POST /api/v1/notifications/watchlist/alert`
2. **Notification service** resolves channel from preferences
3. **Record notification** in database with status `QUEUED`
4. **Async sender** delivers (future implementation)

### From Customer

1. **Customer** calls `GET /api/v1/notifications?limit=50&offset=0`
2. **Authorization check**: `accountId` from JWT matched against notification's `accountId`
3. **Return** paginated list, newest first

## Idempotency

Notifications are keyed on `eventId` (from Kafka event envelope). A replayed event:
- Is detected by unique constraint on `eventId`
- Returns 409 Conflict on second delivery
- Does not create a duplicate notification
- Allows Kafka offset to be committed safely

## Authorization

- **Customer routes**: Require valid JWT with `accountId` claim
- **Internal routes**: Called by notification consumer only (no auth in local dev)
- **Owner-only access**: A customer can only read their own notifications (404 or 403 if mismatch)

## Channel Delivery

**EMAIL**
- Stub: logs to stdout (production: SMS/email provider)
- Status updated when provider responds

**IN_APP**
- Stores notification in database
- UI fetches via `GET /api/v1/notifications`

## Configuration

In `application.yml` or `application.properties`:

```yaml
kafka:
  topics:
    trade-events: trade-events
notification:
  group-id: notification-consumer
  listen: true  # Enable/disable listener
```

## Testing

Unit tests cover:
- Notification recording (idempotency, channel resolution)
- Preference management (create, update, default)
- Authorization (owner-only access)
- Kafka consumer (event mapping, error handling)
- Pagination (limit, offset)

See `test/java/com/trade/notification/**` for test files.

## Future Enhancements

- Email/SMS sender implementations
- Retry scheduler for failed notifications
- Notification template system
- Preferences for which event types trigger notifications
- Unsubscribe/digest options
- Integration with other modules (account requests, security alerts, portfolio changes)
