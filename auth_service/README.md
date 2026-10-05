# auth_service

The Sprint 8 auth service (NestJS): register, login, refresh and `GET /auth/me`.
It is the only component that sees a password; every other service checks the
access token's signature with the shared `JWT_SECRET`.

```bash
npm ci
npm test            # unit tests, no database needed
npm run start:dev   # port 3000; needs Postgres with the Sprint 3 schema
```

Configuration is read from the repository-root `.env` (template:
`.env.example`). In `docker compose` the service is on host port 3000 too.

## What Sprint 8 asked us to record

- **OpenAPI:** human page at `/docs`, JSON at `/docs/json`, generated from the
  code.
- **Login throttle:** 5 failed logins per IP, then a 15-minute cooldown counted
  from the first failure. Only failures count.
- **Security review:** `security-review/sprint8-review.md`.
- **Password hashing and the cost factor:** `design/auth-password-hashing.md`.

The full write-up of the service is in `design/auth-service.md`: endpoints,
the user-first registration flow, the throttle and the tokens. Where we depart
from `contracts/auth-api.yaml`, the reason is in `story_docs/contract-breach.md`.
