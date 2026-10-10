# 0004 When preferences don't answer, notifications fall back to IN_APP rather than failing or skipping

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-10-07 |
| Decided by | the team |

## Context

Before recording an alert, the notifications listener asks preferences how to
deliver it (`TradeEventNotificationListener.java:72` →
`PreferencesService.resolveChannel`). Preferences may not have an answer. Three
cases come up:

- the customer has never saved a preference row;
- the database read fails;
- they chose EMAIL, but no address is on file.

The listener runs on the `trade-events` consumer thread, so whatever it does
there decides whether the Kafka offset moves on.

## Options considered

| Option | For | Against |
|---|---|---|
| Fail and let Kafka redeliver until preferences answers | Never guesses a channel | A preferences outage stalls every trade notification behind it; a permanently missing row redelivers forever |
| Skip the alert when the channel is unknown | Never sends on a channel the customer didn't choose | The customer silently never hears about their own fill |
| **Resolve to a safe default (IN_APP) and tag why** | The customer always hears about their own trade; IN_APP needs no contact detail, so it can't misdirect | The customer may get an alert on a channel they didn't pick; the fallback hides a preferences outage unless the tag is watched |

## Decision

`DefaultPreferencesService.resolveChannel` (`trade_api/.../preferences/DefaultPreferencesService.java:89-122`) never throws, and handles each case as follows:

- **No row:** the per-setting defaults from `PreferenceDefaults` apply. The channel is `IN_APP`, tagged `Source.DEFAULT`.
- **Database error:** the last row read for that account is reused from an
  in-memory cache. **A muted alert stays muted.** Otherwise the alert goes to
  `IN_APP`, tagged `Source.FALLBACK`.
- **EMAIL chosen with no address on file:** the alert goes to `IN_APP`, tagged `NO_CONTACT`.

Muting is respected even in the fallback paths. Falling back only ever widens
"don't know" to IN_APP. It never turns "off" into "on".

## Consequences

- No trade alert is lost because of preferences.
- The cache belongs to one instance and is empty after a restart. A database
  error just after a restart therefore uses the defaults, not the customer's
  last known choice.
- **Known gap.** `NotificationService.recordNotification` picks the channel a
  second time, from the separate `notification-preferences` table
  (`NotificationService.java:71`). That means the on/off answer and the
  recorded channel can disagree, and the email address resolved by
  `ChannelRoute` is thrown away. The fix is to pass the `ChannelRoute` into
  `recordNotification` and remove the second lookup. It is tracked as a
  follow-up.

## Update 2026-10-08

The "known gap" above is closed by [0013](0013-notifications-one-path-one-preference.md):

- `NotificationService.notify(...)` is now the only entry point.
- It uses the `ChannelRoute` from `resolveChannel` directly
  (`NotificationService.java:93`), so the channel is decided once and the
  address is no longer thrown away.
- The separate `notification_preferences` table is dropped (changelog 022).
  `NotificationPreferenceService` is now a thin layer over `PreferencesService`
  and keeps no data of its own.

The fallback rules in this entry are unchanged. The full seam is recorded in
[`contracts/docs/INTEGRATION-SEAMS.md`](../INTEGRATION-SEAMS.md#2-seam-a-notifications--preferences).
