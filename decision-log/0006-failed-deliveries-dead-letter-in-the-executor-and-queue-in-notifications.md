# 0006 What happens to an alert whose delivery fails: recorded as QUEUED, with retries deferred; the executor dead-letters

| Field | Value |
|---|---|
| Status | accepted, one gap still open (see update) |
| Date | 2026-10-07 |
| Decided by | the team |

## Context

An alert can fail at two points:

1. **Recording.** The `trade-events` message arrives, but recording the
   notification throws.
2. **Delivery.** The notification is recorded, but sending it (email, in-app
   push) fails.

The executor already faces the same question for `orders`, and it answers it
with retries and a dead-letter topic. `kafka_pipeline/create_dlt_topics.sh`
creates `orders.DLT`, `trade-events.DLT` and `market-data.DLT`.

## Options considered

| Option | For | Against |
|---|---|---|
| Send inline in the listener; on failure, throw so Kafka redelivers | No new tables or schedulers | A slow or broken SMTP server blocks the `trade-events` partition and delays every customer's alerts, not just one |
| **Record first as `QUEUED`; a separate sender moves it to `SENT`, `RETRYING` or `FAILED`** | The consumer is never held up by delivery; every alert has a durable row and a visible status | Needs a sender and a retry scheduler, which are not built yet |
| Transactional outbox, with a sender capped at N attempts and backoff | Strongest guarantee; standard pattern | More work than the sprint allowed; the `QUEUED` row is already a natural outbox row |

## Decision

**Recording and delivery are split.** A notification is saved as `QUEUED`
(`notification/domain/Notification.java:37`). The other statuses are `SENT`,
`RETRYING` and `FAILED`. Delivery is the job of a separate sender, and the
consumer never waits on it.

**On the executor side, failures are retried and then dead-lettered.**
`DefaultErrorHandler` retries 5 times with exponential backoff (500 ms, ×2,
capped at 5 s), then sends the message to `orders.DLT`.
`PoisonMessageException` skips the retries and goes straight to the DLT
(`trade_executor/.../config/KafkaConsumerConfig.java:35-52`).

## Consequences

- **Known gap: the sender and the retry scheduler are not built**
  (`notification/README.md:109,175`). EMAIL delivery is a stub that logs.
  `design/notifications-api.yaml:27` promises a retry scheduler that doesn't
  exist. Today an alert stays `QUEUED` unless something calls the status
  route.
- **Known gap: recording failures are lost.** `TradeEventNotificationListener`
  catches every exception, logs it and returns
  (`TradeEventNotificationListener.java:90-93`). The offset is then committed,
  and the event never reaches `trade-events.DLT`, which nothing writes to. The
  fix is to give this listener the same `DefaultErrorHandler` and DLT setup as
  the executor.
- Nothing alerts on the size of the DLTs (OWASP review O-15).

## Update 2026-10-08

The first gap above is closed by [0013](0013-notifications-one-path-one-preference.md):
the sender and the retry now exist (`notification/service/NotificationDispatcher.java`).

- **IN_APP:** marked `SENT` as soon as it is stored.
- **EMAIL:** mailed on a separate executor *after the transaction commits*,
  with 5-second SMTP timeouts.
  - A failure is set to `RETRYING` with the reason, and retried every minute.
  - It becomes `FAILED` after an hour, or straight away when no server or
    address exists.
  - A row stuck in `QUEUED` for 2 minutes is picked up again.
- The design chosen above ("record first, send separately") is what was
  built. The outbox option is still rejected.

**The second gap is still open.** `TradeEventNotificationListener` still
catches every exception and commits the offset
(`TradeEventNotificationListener.java:66-69`). A fill whose notification
can't be recorded is lost, not dead-lettered, and nothing writes to
`trade-events.DLT`. This is tracked as S-3 in `INTEGRATION-SEAMS.md`.
