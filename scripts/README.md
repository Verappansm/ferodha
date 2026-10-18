# scripts

- `demo.sh`: the platform demo against the Docker stack. Brings the stack up
  (with `docker compose` or `docker-compose`, whichever exists), creates the
  topics, then walks the auth service (register, login, `/auth/me`, refusal of
  missing and forged tokens) and every trade-api endpoint with real tokens from
  the auth service, including a rejection that travels through Kafka and
  idempotency. Section 6 demonstrates `market-sim`. It also starts the
  trading UI with `ng serve` on http://localhost:4200 (log and PID in `.run/`),
  and Section 7 is a guided tour of it.
  - `./scripts/demo.sh --fresh` wipes the database volume first.
  - `./scripts/demo.sh --no-ui` skips the UI; `--stop-ui` stops it.
  - `NONINTERACTIVE=1 ./scripts/demo.sh` runs without pauses.

The Windows split setup has its own test, `windows/test-windows.sh`.
