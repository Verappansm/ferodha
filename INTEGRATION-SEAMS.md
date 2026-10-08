# Integration Seams: Notifications ↔ Preferences, Watchlists → Notifications

**Scope:** the two in-process seams inside `trade_api`, and the consumer groups the process holds
**Status:** agreed. Each seam was agreed before the callers were built against it; both are now implemented as written below.
**Date:** 2026-10-08
**Decision record:** [decision-log/0014](decision-log/0014-modules-call-each-other-through-named-interfaces.md)

Paths below are relative to `trade_api/src/main/java/com/trade/` unless they start with a top-level folder.

---

## 1. How one module calls another

**Decision:** within trade_api, a module calls another module through a **named Java interface, in process**. It does not make an HTTP hop through the service's front door (`/api/v1/**`) carrying a borrowed customer token.

| Rule | Where it is enforced |
|---|---|
| The caller depends on the other module's interface, not its tables. | `PreferencesService` ("Other modules depend on this interface, never on the table", `preferences/PreferencesService.java:9-10`). `PriceAlertNotifier` finds the account through `AccountDirectory`, "never by reading the Accounts table from this module" (`watchlist/PriceAlertNotifier.java:12-15`). |
| An internal method has no HTTP mapping. | `resolveChannel` is "in-process only: no controller maps it, so no token of any kind can reach it over HTTP" (`preferences/PreferencesService.java:23-26`, `preferences/PreferencesController.java:20`). |
| There are no customer-reachable internal routes. | `NotificationController` maps only the customer's own list, read, read-all and get-by-id routes (`notification/controller/NotificationController.java:30-75`). The earlier `/api/v1/notifications/internal/**` routes are gone. That closes OWASP review item O-1 and R1 for trade_api. |
| The one deliberate HTTP self-call does not borrow a customer token. | A strategy order goes through `HttpOrderPlacer` to `POST /api/v1/orders`, carrying a **60-second delegated token minted for that order**. The filter confines that token to that single route ([decision-log/0001](decision-log/0001-strategies-trade-under-a-delegated-token.md)). |
| Between processes, services talk over Kafka. | [decision-log/0005](decision-log/0005-modules-talk-over-kafka-and-tokens-are-verified-locally.md) |

**Why this matters for access control:** the Sprint 8 review had no equivalent of "an internal path reachable with a customer's token". Running several modules in one process makes such a path easy to leave open. If the internal call were an HTTP route under `/api/v1/**`, `JwtAuthFilter` would admit every customer token to it, and the only guard would be a role check that someone has to remember. Because the internal call has no HTTP route at all, the question never arises.

---

## 2. Seam A: Notifications → Preferences

### The interface

```java
// preferences/PreferencesService.java:27
ChannelRoute resolveChannel(long accountId, AlertType alertType);
```

| | |
|---|---|
| **Caller** | `NotificationService.notify(...)` (`notification/service/NotificationService.java:93`), and the email retry in `NotificationDispatcher` (`notification/service/NotificationDispatcher.java:106`), which re-reads the address before each retry |
| **Provider** | `DefaultPreferencesService` (`preferences/DefaultPreferencesService.java:89-122`) |
| **Transport** | Direct method call in process. There is no URL. |
| **Customer-facing counterpart** | `GET/PUT/DELETE /api/v1/accounts/{id}/preferences` (`design/preferences-api.yaml`), a separate path. Each call checks the caller's token account against the path account (ACC-403). |

### Response shape

```java
// preferences/PreferenceDtos.java:58-61
record ChannelRoute(boolean deliver, NotificationChannel channel, String destination, Source source)
enum Source { STORED, DEFAULT, NO_CONTACT, FALLBACK }
```

| Field | Meaning |
|---|---|
| `deliver` | `false` means the customer turned this alert type off, and nothing is recorded |
| `channel` | `IN_APP` or `EMAIL` |
| `destination` | The real email address when `channel = EMAIL`, otherwise `null`. It is never sent to a browser; the customer only ever sees it masked. |
| `source` | Why this answer was given: `STORED` (the customer's saved row), `DEFAULT` (no row), `NO_CONTACT` (EMAIL chosen but no address), `FALLBACK` (preferences could not read its data) |

### Behaviour when no preference has been set

If there is no row, every setting takes its value from `PreferenceDefaults` (`preferences/PreferenceDefaults.java`):

| Alert type | Default | Result |
|---|---|---|
| `ORDER_FILLED` | on | `deliver=true, IN_APP, null, DEFAULT` |
| `ORDER_REJECTED` | on | `deliver=true, IN_APP, null, DEFAULT` |
| `ORDER_CANCELLED` | on | `deliver=true, IN_APP, null, DEFAULT` |
| `PRICE_ALERT` | on | `deliver=true, IN_APP, null, DEFAULT` |

The default channel is IN_APP because it "is always deliverable: it needs no contact detail and no outside provider".

### When preferences raises or is slow

| Situation | What preferences returns | What notifications then does |
|---|---|---|
| Database read throws | The **last known row** for that account, kept in an in-memory cache. If it muted this type: `deliver=false, FALLBACK`. Otherwise: `IN_APP, FALLBACK`. | Records the alert as IN_APP |
| EMAIL chosen, address lookup throws | `IN_APP, FALLBACK` | Records the alert as IN_APP |
| EMAIL chosen, no address on file | `IN_APP, NO_CONTACT` | Records the alert as IN_APP |
| Something unexpected escapes anyway | n/a | `notify` catches every `RuntimeException`, logs it and returns `Optional.empty()` (`NotificationService.java:111-114`). "A notification problem can never undo the trade that caused it." |
| **Slow** | There is no timeout of its own. The call is a single indexed read on the same Postgres pool, so it is bounded by the pool and driver timeouts. | It waits. See *Open points*. |

**The agreed rule:** `resolveChannel` **never throws**. If it doesn't know the answer, it widens to IN_APP. It **never turns a muted alert back on**.

---

## 3. Seam B: Watchlists → Notifications

### The interface

```java
// notification/service/NotificationService.java:90
Optional<NotificationResponseDto> notify(long accountId, UUID eventId, NotificationEventType type,
                                         String orderId, String symbol, String message);
```

| | |
|---|---|
| **Caller** | `PriceAlertNotifier.notifyTriggered(userId, symbol, message, alertKey)` (`watchlist/PriceAlertNotifier.java:30-35`), called by `PriceAlertEvaluator` |
| **Other callers of the same method** | `TradeEventNotificationListener` for fills and rejections (`notification/event/TradeEventNotificationListener.java:65`), and `OrderController` for cancels (`controller/OrderController.java:91`) |
| **Transport** | Direct method call in process. The old `POST /notifications/watchlist/alert` HTTP route is gone. |
| **Trigger** | `PriceAlertListener` consumes `market-data` in group `watchlist-alerts`, and the evaluator checks each armed alert |

### Request: what the watchlist passes

| Parameter | Value from the watchlist |
|---|---|
| `accountId` | Resolved from the user by `AccountDirectory.tradingAccountOf(userId)`. If the user has no trading account, nothing is sent. |
| `eventId` | `UUID.nameUUIDFromBytes("price-alert:" + alertKey)`, where `alertKey` names the item and the moment it was armed. **A replayed quote notifies once, and a re-armed alert can notify again.** |
| `type` | `PRICE_ALERT` |
| `orderId` | `null` |
| `symbol`, `message` | The symbol and the text of the alert |

### Response shape

| Return | Meaning |
|---|---|
| `Optional.of(NotificationResponseDto)` | Recorded. The fields are `notificationId, accountId, eventId, eventType, orderId, symbol, resolvedChannel, message, status, createdAt, updatedAt, readAt`. `status` is `SENT` for IN_APP, or `QUEUED` until the mail goes out for EMAIL. |
| `Optional.empty()` | Not recorded, for one of three reasons: the customer turned price alerts off, this `eventId` was already recorded, or notify failed internally (which is logged) |

The watchlist ignores the return value. It needs no answer.

### Behaviour when no preference has been set

Notifications calls Seam A. `PRICE_ALERT` defaults to **on, IN_APP**, so the alert is stored and shows up under the nav bell.

### When notifications raises or is slow

| Situation | Behaviour |
|---|---|
| Ordering | The alert is **marked triggered first**, with a guarded UPDATE: `items.markTriggered(itemId, armedAt, price) != 1` skips it (`watchlist/PriceAlertEvaluator.java:42`). Only then is it handed to notifications. A quote replayed on another thread can't fire it twice. |
| `notify` raises | `notify` catches everything itself. As a second line of defence, the evaluator catches and logs: "Alert … triggered but could not be handed to notifications" (`PriceAlertEvaluator.java:52-55`). **The alert stays triggered and is not retried.** The customer can re-arm it. |
| Email is slow or the server is down | It never blocks the watchlist. EMAIL goes out on `notificationMailExecutor` after commit, with 5-second connect, read and write timeouts (`notification/mail/NotificationMailConfig.java:19,50-52`). A failure is set to `RETRYING`, retried every minute, and set to `FAILED` after an hour (`NotificationDispatcher.java:27-30,77-118`). |
| Notifications' own database write is slow | The `market-data` consumer thread for `watchlist-alerts` waits. Quotes older than 900 s are ignored when consumption resumes (`watchlist.alerts.max-quote-age-seconds`). |

**The agreed rule:** a failure in notifications never re-fires an alert, and it never blocks another consumer group. A lost price alert is preferred to a duplicate one.

---

## 4. Consumer groups

Each listener has an explicit group ID set in `application.yml`, and no other module uses it. trade_api now holds **four** groups in one process. Separate IDs keep their offsets apart, so a slow or failing module can't hold another module's position on the same topic.

| Process | Module | Topic(s) | Group ID | Offset reset | Where it is set |
|---|---|---|---|---|---|
| trade_api | portfolio (quotes) | `market-data` | `trade-api-quotes-${random.uuid}` (unique per start, on purpose, so it re-reads retained quotes) | default | `trade_api/src/main/resources/application.yml:62`, `event/MarketDataListener.java:39` |
| trade_api | notifications | `trade-events` | `notification-consumer` | default | `application.yml:76`, `notification/event/TradeEventNotificationListener.java:34` |
| trade_api | watchlist alerts | `market-data` | `watchlist-alerts` | `latest` | `application.yml:91`, `watchlist/PriceAlertListener.java:40` |
| trade_api | strategies | `market-data`, `trade-events` | `strategy-service` | default | `application.yml:96`, `strategy/StrategyListener.java:33,52` |
| trade_executor | executor | `orders` | `trade-executor` | default | `trade_executor/src/main/resources/application.yml:17`, `OrderPlacedListener.java:29` |

Notes:

- `strategy-service` subscribes to two topics from one module. It is still one group, owned by one module, which the rule allows.
- pricing_generator and trades_generator only produce messages. Neither has a consumer group.
- The `@KafkaListener` annotations still carry fallback defaults (`${…:notification-consumer}` and so on), and those match the configured values. Don't reuse these IDs in a new module.

---

## Open points

| # | Point | Owner |
|---|---|---|
| S-1 | Neither seam has a call timeout of its own. A slow Postgres stalls the consumer thread that is calling. If this ever shows up, consider a JDBC statement timeout (MyBatis `defaultStatementTimeout`). | trade_api owner |
| S-2 | The `preferences` cache of last-known rows belongs to one instance and is empty after a restart, so a database outage right after a restart falls back to defaults. That is accepted. | trade_api owner |
| S-3 | `TradeEventNotificationListener` still catches and commits on failure, so a fill whose notification can't be recorded is not dead-lettered ([decision-log/0006](decision-log/0006-failed-deliveries-dead-letter-in-the-executor-and-queue-in-notifications.md)). | trade_api owner |
| S-4 | In `application.yml` the "Automated strategies" comment sits above the `notification:` block rather than the `strategy:` block. It is cosmetic, but it misleads anyone reading the group config. | trade_api owner |
