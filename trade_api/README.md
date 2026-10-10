# trade_api

The Trade REST API (Spring Boot, Sprint 6): places and cancels orders and
answers account, balance, position and order-history reads. Every
`/api/v1/**` route needs a JWT from the auth service. It owns every schema
change after Sprint 3, as Liquibase changesets in
`src/main/resources/db/changelog/`.

```bash
mvn test                  # unit and slice tests; *IT tests need Docker
mvn spring-boot:run       # port 8081; env vars listed in manifest.env
```

In `docker compose` it is on host port 8081 too.

## Where the design lives

- Sprint 6 fixed the API in `contracts/trade-api.yaml`; our copy is
  `contracts/trade-api.yaml`, and the shared error envelope is
  `contracts/docs/envelope-contract.md`.
- Sprint 7 asked us to publish `ORDER_PLACED` after the order is recorded. The
  topics and keys are justified in `contracts/docs/kafka.md`.
- Where we depart from the contracts (for example `PARTIALLY_FILLED`), the
  reason is in `story_docs/contract-breach.md`.

## Kafka consumer groups

This process holds four consumer groups, one per module. Each group ID is
explicit, set in `src/main/resources/application.yml`, and shared with no
other module, so their offsets stay apart. Don't reuse these IDs in a new
module; give it its own. The full register is in
[`../INTEGRATION-SEAMS.md`](../INTEGRATION-SEAMS.md#4-consumer-groups).

| Module | Topic(s) | Group ID |
|---|---|---|
| portfolio (quotes) | `market-data` | `trade-api-quotes-${random.uuid}`, unique per start on purpose, so the retained quotes are re-read |
| notifications | `trade-events` | `notification-consumer` |
| watchlist alerts | `market-data` | `watchlist-alerts` |
| strategies | `market-data`, `trade-events` | `strategy-service` |
