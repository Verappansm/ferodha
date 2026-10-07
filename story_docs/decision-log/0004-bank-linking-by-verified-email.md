# 0004 A trading account is linked to the bank account held under the user's verified email

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-10-07 |
| Decided by | the team |

## Context

`Third_Party_Bank` stands for the customer's own bank, a system we do not own. The admin
console used to type in a bank account number at approval and create the bank row if it did
not exist, which let an operator invent a bank account. The old foreign key from the bank
table to `Users(email)` forced that, because a bank row could not exist before the user did.

## Decision

- Bank rows are added in Postgres only, before the customer registers, keyed by the email the
  bank holds. The foreign key to `Users` is dropped (changelog 021).
- Registration mails a 6-digit code (10 minutes, 5 guesses, one resend a minute). Entering it
  sets `Users.email_verified_at`: the email, and so the bank account held under it, is theirs.
- Approval needs a verified email and uses the bank account found by that email. The console
  cannot create or choose one; an optional `bankAccountNumber` must equal the found one.
- One bank account per email and one trading account per bank account, enforced by unique
  indexes, so a user holds one bank account and a bank account belongs to one user.

## Consequences

Seeded users and everyone who already had an account are marked verified by the migration.
The sign-up code needs a mail server (`SMTP_HOST`); without one it is written to the auth
service log (development only).
