# End-to-End Integration on Live Data

**Chain under test:** preferences → notifications → watchlists, with portfolio alongside
**Status:** test procedure written. **Run results:** _fill in after the run (who ran it, the date, pass or fail)_

---

## 1. The chain

```
Settings page ──PATCH /accounts/{id}/preferences──► preferences (pref_customer_preference)
                                                         ▲ resolveChannel()  (in-process)
order ──► trade_api ──orders──► trade_executor ──trade-events──► notifications ──► IN_APP row / SMTP
                                                         ▲ notify()  (in-process)
pricing_generator ──market-data──► watchlist-alerts consumer ──► PriceAlertEvaluator
                       └────────────► portfolio quotes consumer ──► /portfolio
```

A trade notification and a watchlist alert both go through `NotificationService.notify`. That method asks `resolveChannel` for the account's **single** channel setting, so a price alert always arrives on the same channel as a trade notification. The seam contracts are in [INTEGRATION-SEAMS.md](INTEGRATION-SEAMS.md).

---

## 2. Every route is authorised against the verified token

`JwtAuthFilter` checks the token's signature, expiry, issuer, audience and blocked status on every `/api/v1/**` request. It then puts the verified `AuthenticatedPrincipal` on the request. Each controller below takes identity **only** from that principal, never from the request body.

| Module | Routes | Ownership check | Evidence |
|---|---|---|---|
| Preferences | `GET`, `PATCH`, `DELETE /accounts/{id}/preferences` | The path `{id}` must equal `principal.accountId()`, or the request gets ACC-403 | `preferences/PreferencesController.java:36,45,53` |
| Notifications | `GET /notifications`, `POST /read-all` | Scoped to `principal.accountId()` | `notification/controller/NotificationController.java:45,61` |
| | `GET /notifications/{id}`, `PATCH /{id}/read` | The row's owner must equal `principal.accountId()` | `NotificationController.java:69,82` |
| | `GET`, `PATCH /notification-preferences` | `principal.accountId()` | `NotificationPreferenceController.java:37,48` |
| Watchlists | All `/watchlists/**`, including `/items/{itemId}/alert` | Every call is scoped to `principal.subjectUserId()` | `watchlist/WatchlistController.java:33-34` and each handler |
| Portfolio | `GET /portfolio/{accountId}`, `/positions`, `/pnl` | The path `{accountId}` must equal `principal.accountId()` | `controller/portfolio/PortfolioController.java:38,47,58` |

There are no internal HTTP routes. The two seams are in-process only ([decision-log/0014](decision-log/0014-modules-call-each-other-through-named-interfaces.md)).

## 3. Each module can be reached from the Angular application

| Module | UI route | Client |
|---|---|---|
| Preferences | `/settings` | `trading-ui/src/app/api/preferences-api.ts` (generated: `api/generated/preferences`) |
| Notifications | Nav bell (unread count, polled every 30 s) and `/notifications` | `core/notifications/notifications.store.ts` (generated: `api/generated/notifications`) |
| Watchlists | `/watchlist` | Generated: `api/generated/watchlist` |
| Portfolio | `/portfolio` | `trading-ui/src/app/api/portfolio-api.ts` (generated: `api/generated/portfolio`) |

---

## 4. Integration test (live data, no step stubbed)

### Before you start

- Start the full stack: `./scripts/demo.sh` (Docker), or `windows/start-windows.ps1` on Windows. Postgres, Kafka, auth_service, trade_api, trade_executor and pricing_generator must all be running.
- **Don't** use `--fresh` with test seeds, and don't run any `src/test` fixtures. The rows come from the seeded database plus whatever you create below.
- For an EMAIL run, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` and `SMTP_PASSWORD` for trade_api (a real mailbox, or a Mailtrap or MailHog inbox you can see). Without them EMAIL is marked FAILED by design. The IN_APP run needs nothing extra.
- Sign in at http://localhost:4200 as `john.carter@example.com`.

### Part 1: a stored preference drives a trade notification

| Step | Action | Expected | Check against real data |
|---|---|---|---|
| 1.1 | Open **Settings**, set the channel to **EMAIL** (or IN_APP), and make sure *order filled* is on. Save. | 200, and the address is shown masked | `SELECT notification_channel FROM pref_customer_preference WHERE account_id = <id>;` shows `EMAIL` |
| 1.2 | Place a real market **BUY** for 1 share of a listed instrument | The order is NEW, then FILLED | `orders` row with status `FILLED`; an `ORDER_FILLED` message on `trade-events` (visible in Kafka UI at http://localhost:8091) |
| 1.3 | Watch the bell | Unread count goes up; `/notifications` shows "Order … filled" | `SELECT resolved_channel, status FROM notifications ORDER BY created_at DESC LIMIT 1;` shows `EMAIL` and `SENT` (or `IN_APP` and `SENT`) |
| 1.4 | EMAIL run only: check the inbox | The mail arrived | The mailbox |

### Part 2: a quote that crosses a price alert is delivered through notifications, on the same channel

| Step | Action | Expected | Check against real data |
|---|---|---|---|
| 2.1 | Open **Watchlist** and add the same instrument. Note its current price. | The item is shown with a live price | — |
| 2.2 | Arm a price alert just above the current price (for example +0.1 %) | The alert is ACTIVE | The watchlist item row shows the alert ACTIVE |
| 2.3 | Wait for pricing_generator's next ticks (one every 5 s) to cross the threshold. If the price drifts away, re-arm the alert just under the price instead. | The alert becomes TRIGGERED once | Item row `TRIGGERED` with the trigger price; the `watchlist-alerts` group's offset is advancing in Kafka UI |
| 2.4 | Watch the bell | A "price alert" notification appears | Newest `notifications` row: `event_type = PRICE_ALERT` and **the same `resolved_channel` as step 1.3** |
| 2.5 | Let several more crossing quotes arrive | **No** second alert | Still only one `PRICE_ALERT` row for this arming |

**Portfolio alongside:** open `/portfolio`. The share bought in 1.2 is valued at the live `market-data` mid, and the stale flag is off.

### Pass or fail record

| Run | Who | Date | Channel | Part 1 | Part 2 | Portfolio | Notes |
|---|---|---|---|---|---|---|---|
| 1 | | | IN_APP | | | | |
| 2 | | | EMAIL | | | | |

---

## 5. What "live data" means here

| | Source | Fixture? |
|---|---|---|
| Rows | The running Postgres, plus the orders, preferences and alerts created in the test | No |
| Messages | Real Kafka topics, `orders` → `trade-events`, produced by the running services | No |
| Quotes | **pricing_generator publishes synthetic ticks bounded around real Fauxnance anchor quotes** (LEAP-002). Under the main profile, the executor fills at a real Fauxnance quote. | Not a fixture, but simulated. Say so in the demo. |

Don't publish a hand-written message with `kafka-console-producer` to force a crossing. That is a stubbed step, and it demonstrates the fixture rather than the system. Arm the alert close to the live price and let the feed cross it.

## 6. Rotation

Before Friday, each person should run this test on a module they didn't build and answer for it:
- the watchlist consumer and its group
- the dispatcher's retry rules
- the `resolveChannel` fallbacks
- portfolio's stale flag

| Person | Built | Ran the test on / can answer for |
|---|---|---|
| | | |
| | | |
| | | |
| | | |

## 7. Known gaps to mention if asked

- `scripts/demo.sh` walks through auth and the trade endpoints but **not** this chain. Run section 4 by hand, or extend the script.
- A fill whose notification can't be recorded is logged, not dead-lettered (seam point S-3).
