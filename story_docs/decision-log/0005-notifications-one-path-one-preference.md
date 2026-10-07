# 0005 Notifications: one entry point, the Settings preferences, real SMTP, an in-app list

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-10-07 |
| Decided by | the team |

## Context

The notifications module arrived with its own channel table, an event listener that ignored the
per-event Settings, no email sender, no cancel events, and no way for a customer to read them.

## Decision

- `NotificationService.notify(...)` is the only way a notification is made: it asks
  `PreferencesService.resolveChannel` (the Settings page's data) whether this type is wanted and
  on which channel, stores one row per event id, then `NotificationDispatcher` delivers it.
- Order fills and rejections arrive from the executor over Kafka (`trade-events`); a cancel is
  announced by `OrderController` after the cancel commits (the executor never sees cancels);
  watchlist price alerts come from `PriceAlertChecker`. Partial fills notify nobody, by choice.
- IN_APP is delivered by being stored. EMAIL goes out over SMTP; a failure is RETRYING with a
  reason, retried every minute, FAILED after an hour or when no server or address exists.
- The module keeps no preference table; the channel lives in `pref_customer_preference`.
- Customers read them in the app: the nav bell (unread count, polled every 30 s) and
  `/notifications`, with `read_at` per row.

## Consequences

The Sprint 3 `Notifications` rows were copied into the module's table and the old table dropped
(changelog 023). `/api/v1/notifications/internal/**` accept operator tokens only.
