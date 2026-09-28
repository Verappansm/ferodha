# Envelope Contract

Source of truth: `kafka_contract.md`.

## 1. The envelope

Every message on `orders`, `trade-events`, and `market-data` is JSON/UTF-8 and carries
the same five-field envelope plus a `payload` (see `EventEnvelope.java`):

| Field | Type | Notes |
|---|---|---|
| `eventId` | UUID | Unique per message. The idempotency key for consumers. |
| `eventType` | string, enum | Discriminates the payload (`ORDER_PLACED`, `ORDER_FILLED`, `QUOTE`, etc). |
| `eventTime` | Instant / RFC 3339 UTC | When the producer created the event, not when it was consumed. |
| `source` | string | Producing component: `trade-api`, `trade-executor`, `market-poller`. |
| `schemaVersion` | int | Starts at 1. Increments only on a breaking change. |
| `payload` | object | Topic- and event-type-specific. One of `OrderPlacedPayload`, `TradeEventPayload`, `QuotePayload`. |

Adding an optional field is **not** a breaking change and does **not** bump
`schemaVersion`. Removing a field, renaming one, or changing its type **is** breaking.
