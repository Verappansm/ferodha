# 0011 The browser sends a salted SHA-256 digest of the password, not the password itself

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-10-07 |
| Decided by | the team |

## Context

Locally, and through any proxy that logs request bodies, the UI talks to
auth_service over plain http. The team wanted the user's real password never
to appear on the wire or in a server log, because people reuse passwords on
other sites.

## Options considered

| Option | For | Against |
|---|---|---|
| Send the plain password and rely on TLS | Standard; the server can enforce length and complexity rules | On http or a logging proxy, the reusable password is exposed |
| A PAKE such as OPAQUE or SRP | The server never learns anything replayable | Heavy; no mature Angular and NestJS pairing within the sprint |
| **Send `sha256("ferodha-v1:" + email + ":" + password)`; the server bcrypts it at cost 12** | The real password never leaves the browser; the digest is different for every site and user | The digest becomes the credential, so replaying it works; password rules can only be checked in the browser |

## Decision

The UI hashes the password before sending it
(`trading-ui/src/app/core/auth/password-digest.ts`). The server treats the
digest as the password and bcrypts it. Users registered before this change
have to register again. The seed users were re-hashed in Liquibase changeset
012 (contract-breach B23).

## Consequences

- A leaked request or log no longer exposes a password the user may reuse
  elsewhere, but it does still let an attacker sign in here. **This is not a
  substitute for TLS.** The OWASP review keeps https as open item O-10.
- The server can't enforce minimum length, because a digest is always 64 hex
  characters.
- Reversing this means one more re-registration or rehash migration. That cost
  is why it has its own entry.
