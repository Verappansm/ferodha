# 0007 The shared Users table owns the customer's email; other modules read it when they need it and never copy it

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-10-07 |
| Decided by | the team |

## Context

Several modules need the customer's email address:

- auth_service uses it as the login name and the verification address.
- Notifications needs it to send EMAIL alerts.
- Bank funding matches it against `Third_Party_Bank.email`.
- The profile page displays it.

The contract asked for a separate `auth` schema that "never reads accounts"
(contract-breach B05). If more than one module stores the address, a change in
one place leaves stale copies everywhere else.

## Options considered

| Option | For | Against |
|---|---|---|
| auth_service owns identity in its own schema and exposes email through an API or `user-updated` events | Clean ownership; matches the contract | trade_api must call auth or keep a replica in sync; two sources of truth for who a person is |
| Preferences stores the address the customer wants alerts sent to | Lets a customer route alerts to another address | A second copy to drift, leak, and forget to erase; it adds a customer-supplied destination (see the R2 risk in the OWASP review) |
| **One `Users.email` in the shared schema, read on demand** | One source of truth; nothing to sync; nothing extra to erase | auth_service and trade_api share tables, which is the contract departure B05 |

## Decision

The single record is `Users.email`. Registration makes the email the username,
stored in lower case (B01), and it is read-only after registration (`PATCH
/profile` changes name and phone only, B22).

Preferences stores only the channel choice. It reads the address when it needs
it with `findContactEmail` (`Accounts JOIN Users`,
`trade_api/src/main/resources/mapper/PreferencesMapper.xml:58-63`).

The customer only ever sees the address masked (`r****@gmail.com`,
`DefaultPreferencesService.java:191-201`). The full address goes only to
in-process callers.

## Consequences

- Erasing or changing a customer's email takes one write in one place.
- There is no customer-supplied delivery destination, which is why the OWASP
  review found no webhook or SSRF exposure (R2).
- auth_service and trade_api are coupled through the schema. Splitting them
  later means introducing the API or event in the first option, which would
  take well over an afternoon.
- A customer can't send alerts to a different address. If that is ever wanted,
  it has to be a verified secondary address, not a free-text field.
