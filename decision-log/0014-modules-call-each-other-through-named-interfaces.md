# 0014 Modules inside trade_api call each other through a named interface, not over HTTP through the front door

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-10-08 |
| Decided by | the team |

## Context

trade_api now runs several modules in one process: orders, portfolio,
preferences, notifications, watchlists and strategies. Two of them depend on
another module:

- Notifications must ask preferences whether to send an alert and on which
  channel.
- Watchlists must hand a triggered price alert to notifications.

Both seams had to be agreed before either side built against a guess.

`JwtAuthFilter` admits any valid customer token to every `/api/v1/**` route
outside `/api/v1/admin/**`. The first notifications build exposed
`/api/v1/notifications/internal/*` for other callers. A customer token was
stopped only by a role check inside the controller, and the OWASP review
flagged this as R1/O-1.

## Options considered

| Option | For | Against |
|---|---|---|
| HTTP through the front door, carrying the customer's token | Looks like a service boundary; one style for everything | An internal route under `/api/v1/**` is reachable by every customer token unless someone remembers a role check; a borrowed token gives the caller all of the customer's rights; an extra serialisation and network hop inside one process |
| Internal HTTP routes behind a service credential | A real boundary, ready to split into separate services | A new credential type to mint, verify and rotate, for callers that share a JVM |
| Read the other module's tables directly (for example, a mapper that joins `pref_customer_preference`) | Fastest to write | No seam left to reason about; the two modules can't fail independently; schema changes break the other module silently |
| **A named Java interface, called in process, with no HTTP mapping** | Nothing for a token to reach; the interface is the agreed contract; each side can define its own failure behaviour | Splitting a module into its own service later means adding a real transport behind the interface |

## Decision

- **Notifications calls `PreferencesService.resolveChannel(accountId,
  alertType)`, which returns a `ChannelRoute`.** No controller maps it. It
  never throws. If it doesn't know the answer it widens to IN_APP, and it
  never unmutes an alert.
- **Watchlists calls `PriceAlertNotifier`, which calls
  `NotificationService.notify(...)`.** That is the one way any notification
  is made. It never throws, and it de-duplicates by `eventId`.
- **No module reads another module's tables.** The watchlist finds accounts
  through `AccountDirectory`. Preferences owns `pref_*`, and notifications
  owns its own table.
- **The internal notification HTTP routes are removed.**
- **The one HTTP self-call is the strategy order path.** It carries a
  per-order delegated token, not a borrowed one (0001).

The full shapes, defaults and failure behaviour are written down in
[`contracts/docs/INTEGRATION-SEAMS.md`](../INTEGRATION-SEAMS.md).

## Consequences

- No internal path can be reached by a customer token, because no internal
  path exists. OWASP item O-1 is closed.
- Each seam fails on its own terms. Preferences failing degrades the channel,
  not the trade. Notifications failing loses one alert, but it never re-fires
  one or blocks another consumer.
- Neither call has a timeout of its own. A slow database stalls the consumer
  thread making the call (open point S-1).
- To move a module into its own service later, put a client implementation
  behind the same interface. The callers don't change.
