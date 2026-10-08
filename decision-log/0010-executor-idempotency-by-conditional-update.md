# 0010 The executor stays idempotent through a guarded UPDATE, not a processed-events table or row locks

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-10-07 |
| Decided by | the team |

## Context

Kafka delivers at least once, so the executor can see the same `ORDER_PLACED`
twice. Under `market-sim`, a time-to-live cancel and a match can also race on
the same order. Settling twice moves money twice.

## Options considered

| Option | For | Against |
|---|---|---|
| A `processed_events` table keyed by `eventId`, checked before handling | Generic; works for any handler | An extra write per message; doesn't cover the cancel-versus-match race, which isn't a duplicate event |
| `SELECT ... FOR UPDATE` row locks around settlement | Easy to reason about | Holds locks across the pricing call; deadlock risk with the order-book matcher |
| **A conditional UPDATE: `WHERE filled_quantity = :prev AND status IN ('NEW','PARTIALLY_FILLED')`** | One statement; covers both duplicates and races; no locks held | Every settlement path must go through the guarded statement |

## Decision

Settlement only proceeds if the guarded UPDATE affects exactly one row
(`trade_executor/src/main/resources/mapper/OrderMapper.xml:87-104`,
`fillOrderIfNew`). If it affects no rows, the message is a duplicate or lost a
race, and the executor acknowledges it without doing anything.

## Consequences

- Replaying a settled order does nothing. The OWASP review confirmed this
  (A04).
- This guarantees that one order settles at most once. It does **not**
  guarantee that the message is genuine: a forged first message still
  settles. That is the open item O-2.
- MyBatis's explicit SQL makes these guarded statements straightforward to
  write. That is one reason the team kept MyBatis over JPA, where optimistic
  locking would need a version column on every table.
