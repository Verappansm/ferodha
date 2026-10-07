# Customer preferences (`com.trade.preferences`)

LEAP-010 / Team 2. One customer's settings: alert channel and which alerts to send, theme,
number format, compact tables, hidden balances and start page. Runs inside the Trade REST API -
same port, same container, its own package, table and contract.

| Piece | Where |
|---|---|
| Contract | `design/preferences-api.yaml` |
| Routes | `PreferencesController` - `GET`, `PATCH`, `DELETE /api/v1/accounts/{id}/preferences` |
| Interface other modules use | `PreferencesService` |
| Defaults | `PreferenceDefaults` |
| Table | `pref_customer_preference`, Liquibase `016-preferences.sql` |
| SQL | `mapper/PreferencesMapper.java`, `resources/mapper/PreferencesMapper.xml` |

## Decisions

**Scoping.** Every route compares the account in the path with the `accountId` claim of the
verified token (`AccountAccessGuard.requireTokenMatches`), after `JwtAuthFilter` has checked the
token itself. A mismatch is `ACC-403`: another account's preferences are refused, never returned
empty.

**Internal path kept off customer routes.** The notifications module calls
`PreferencesService.resolveChannel(accountId, alertType)` in-process. No controller maps it, so it
has no URL and no token - customer or otherwise - can reach it. An HTTP route outside `/api/v1`
would have been worse than none: `JwtAuthFilter` only guards `/api/v1/**`, so it would be public.

**Stored vs referenced.** Only the choice (`EMAIL` / `IN_APP`) is stored. The email address stays
on `Users`, its one owner, and is read when needed: no second copy to drift, leak or forget to
erase. Customers only ever see it masked (`r****@gmail.com`); the real address goes only to the
in-process caller that sends the message.

**No preference set.** No row exists until the customer changes something. Every column is
nullable; null means "not set" and the value from `PreferenceDefaults` applies on read, so a saved
value overrides only that setting. `customised` in the response lists what was saved. Reset deletes
the row.

**Default account.** The platform gives each user one account, so the default account is the
account itself, written with the first change. The UI applies the stored preferences at sign-in.

**When this module fails.** `resolveChannel` never throws - a customer must still hear about
their own trade. On a database error it uses the last row it read for that account (so a muted
alert stays muted), and otherwise routes to `IN_APP`, which needs no contact detail. `EMAIL` with
no address on file also routes to `IN_APP`. The `source` field on `ChannelRoute` records why
(`STORED`, `DEFAULT`, `NO_CONTACT`, `FALLBACK`). The customer routes fail normally; the UI then
keeps working on defaults.

## Tests

- `DefaultPreferencesServiceTest` - defaults, partial override, another account refused,
  masking, routing and fallback.
- `PreferencesControllerWebTest` - save and read back, `ACC-403`, `AUTH-401`, `VAL-422`, no
  internal route.
- `mapper/PreferencesMapperIT` (Testcontainers, needs Docker) - real SQL, survives a restart of the
  application context, reset.
