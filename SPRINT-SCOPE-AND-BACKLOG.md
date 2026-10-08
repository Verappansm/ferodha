# Sprint Scope and Backlog: Preferences, Notifications, Watchlists, Portfolio

**Modules:** preferences · notifications · watchlists · portfolio, all inside `trade_api`
**Briefs read by:** _list every team member, since all four briefs were read together as a team_
**Scope confirmed with:** _instructor name_, on _Monday date_
**Tracker:** _link to the board where these stories live_

> **Fill in before submitting.** The three lines above are the evidence for the
> first acceptance criterion, and only the team can supply them. If the
> instructor meeting did not happen on Monday, record the actual date. Don't
> backdate it.

---

## 1. What we brought to the instructor

### What we intend to build by Friday

| Module | Contract | In scope |
|---|---|---|
| **Portfolio** | Neueda contract `contracts/portfolio-api.yaml` (as built: `design/portfolio-api.yaml`) | Summary, priced positions, P&L for one account, priced from `market-data` |
| **Preferences** | **No Neueda contract.** We proposed `design/preferences-api.yaml` | Read, update and reset a customer's settings, including the one notification channel (IN_APP or EMAIL) and an on/off switch for each alert type |
| **Notifications** | **No Neueda contract.** We proposed `design/notifications-api.yaml` | Notifications for order fills, rejections and cancels and for price alerts, each following the customer's preferences; an in-app list with read state; email over SMTP with retry |
| **Watchlists** | **No Neueda contract.** We proposed `design/watchlist-api.yaml` (contract-breach B35) | Watchlists and items; one price alert per item, checked against `market-data` and delivered through notifications |

### What we decided not to build

| Not built | Why |
|---|---|
| SMS, push or webhook channels | A webhook is a destination the customer supplies, which the platform would then post to (an SSRF risk; OWASP review R2). IN_APP and EMAIL cover the brief. |
| A customer-chosen alert email address | The address lives only in `Users.email` ([decision-log/0007](decision-log/0007-users-table-owns-contact-details-read-on-demand.md)) |
| Notifications for partial fills | Too noisy; customers hear about the final outcome ([decision-log/0013](decision-log/0013-notifications-one-path-one-preference.md)) |
| Internal HTTP routes between modules | Modules call each other in-process through interfaces ([decision-log/0014](decision-log/0014-modules-call-each-other-through-named-interfaces.md)) |
| Live FX for portfolio totals | Fixed at 90 INR = 1 USD until LEAP-006 (contract-breach B20) |

### Routes proposed for the three modules without a contract

All routes are under `/api/v1/`, require a customer token, and are scoped to the token's own account or user.

| Module | Route | Purpose |
|---|---|---|
| Preferences | `GET /accounts/{id}/preferences` | Read the settings, with defaults filled in |
| | `PATCH /accounts/{id}/preferences` | Change some settings |
| | `DELETE /accounts/{id}/preferences` | Reset to defaults |
| Notifications | `GET /notifications` | The caller's notifications, paged |
| | `GET /notifications/{id}` | One notification (owner only) |
| | `PATCH /notifications/{id}/read` | Mark one read |
| | `POST /notifications/read-all` | Mark all read |
| | `GET`, `PATCH /notification-preferences` | Channel only; a thin layer over preferences |
| Watchlists | `GET`, `POST /watchlists`; `GET`, `PATCH`, `DELETE /watchlists/{id}` | Watchlists |
| | `GET`, `POST /watchlists/{id}/items`; `DELETE /watchlists/{id}/items/{itemId}`; `PATCH /watchlists/{id}/items/reorder`; `POST /watchlists/items/bulk` | Items |
| | `POST`, `PATCH`, `DELETE /watchlists/{id}/items/{itemId}/alert` | Arm, change or cancel the item's price alert |

**The two in-process seams, not routes:** notifications → `PreferencesService.resolveChannel`, and watchlists → `NotificationService.notify`. Both are specified in [INTEGRATION-SEAMS.md](INTEGRATION-SEAMS.md).

---

## 2. Plan: by the order of the chain, not one person per module

```
preferences ──► notifications ──► watchlists        (the chain)
portfolio  (alongside; depends only on market-data)
```

Notifications can't decide a channel until preferences answers. Watchlists can't deliver an alert until notifications exists. If four people started four modules on Monday, the two downstream modules would be blocked by lunchtime. So we planned the work in this order:

| When | Pair A | Pair B |
|---|---|---|
| Mon AM | Agree both seams ([INTEGRATION-SEAMS.md](INTEGRATION-SEAMS.md)); write the backlog | Draft the three proposed contracts |
| Mon PM–Tue | **Preferences**: table, defaults, `resolveChannel` | **Portfolio**: priced positions from `market-data` |
| Tue–Wed | **Notifications**: `notify`, dispatcher, in-app list | Portfolio P&L; start **watchlists** CRUD against the agreed `notify` signature |
| Wed–Thu | Watchlist alerts: consumer group `watchlist-alerts`, evaluator | Angular: Settings, bell and `/notifications`, watchlist alerts |
| Thu | **Rotate:** each pair takes over the other's modules and runs the integration test ([E2E-INTEGRATION.md](E2E-INTEGRATION.md)) | |
| Fri | Demonstration on live data | |

_Replace "Pair A" and "Pair B" with names._

---

## 3. Backlog with acceptance criteria

Each story is written as *"As a … I want … so that …"*, followed by testable criteria. Mirror these in the tracker. **The status column is today's state of the code (2026-10-08), not the plan.**

### Preferences

| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| PREF-1 | As a customer I want to see my settings, so that I know how I'll be told about events | `GET /accounts/{id}/preferences` returns every setting, with defaults filled in for anything never changed. Another account's ID gives ACC-403. | Done |
| PREF-2 | As a customer I want to choose IN_APP or EMAIL and switch each alert type on or off | `PATCH` stores only the fields sent. An unknown channel gives 400. The response returns the address masked (`r****@…`). | Done |
| PREF-3 | As a customer I want to reset to defaults | `DELETE` removes the stored row, and `GET` then returns the defaults | Done |
| PREF-4 | As the notifications module I need a channel decision that never fails | `resolveChannel` returns a `ChannelRoute`. With no row it defaults to IN_APP. On a database error it uses the last known row or IN_APP, never throws, and never unmutes a muted alert. | Done |

### Notifications

| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| NOT-1 | As a customer I want to hear when my order fills, is rejected or is cancelled | A `trade-events` fill or reject, or a committed cancel, creates exactly one notification per event ID, on the channel `resolveChannel` gives | Done |
| NOT-2 | As a customer I want to read my notifications in the app | `GET /notifications` lists only the caller's own. The bell shows the unread count (polled every 30 s). Read and read-all set `read_at`. | Done |
| NOT-3 | As a customer who chose EMAIL I want the alert in my inbox | Mail is sent after commit. A failure sets RETRYING (retried every minute), then FAILED after 1 hour. A missing server or address sets FAILED at once. | Done |
| NOT-4 | As the platform I want a failed recording to be recoverable | A `trade-events` message that can't be recorded goes to `trade-events.DLT` | **Open** (seam point S-3) |

### Watchlists

| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| WL-1 | As a customer I want watchlists of instruments | CRUD on watchlists and items, scoped to the token's user. Another user's watchlist gives 404 or 403. | Done |
| WL-2 | As a customer I want a price alert on an item | Arming an alert sets it ACTIVE. Cancelling sets it CANCELLED. Setting it again re-arms it. | Done |
| WL-3 | As a customer I want to be told when the price crosses my alert | Consumer group `watchlist-alerts` reads `market-data`. The first crossing quote sets TRIGGERED with a guarded update, and the alert is handed to `notify` as `PRICE_ALERT` **on the same channel as my trade notifications**. A replayed quote doesn't notify twice. Quotes older than 15 minutes are ignored. | Done |

### Portfolio (Neueda contract)

| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| PF-1 | As a customer I want my holdings valued at current prices | `GET /portfolio/{accountId}` and `/positions` are priced from the latest `market-data` mid, with a stale flag after 300 s. Another account gives 403. | Done |
| PF-2 | As a customer I want my profit and loss over a period | `GET /portfolio/{accountId}/pnl?from&to&bySymbol` | Done |

### Cross-cutting

| ID | Story | Acceptance criteria | Status |
|---|---|---|---|
| X-1 | Every new route authorises against the verified token | See the route matrix in [E2E-INTEGRATION.md](E2E-INTEGRATION.md) | Done |
| X-2 | Every module can be reached from the Angular application | Settings, the `/notifications` page, the bell, `/watchlist` and `/portfolio` | Done |
| X-3 | One combined OWASP review | [OWASP-SECURITY-REVIEW.md](OWASP-SECURITY-REVIEW.md) | Draft |
| X-4 | Decision log | [decision-log/](decision-log/) | Done |
