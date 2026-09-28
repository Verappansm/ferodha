# trade_api

The Trade REST API (Spring Boot, Sprint 6): places and cancels orders and
answers account, balance, position and order-history reads. Every
`/api/v1/**` route needs a JWT from the auth service. It owns every schema
change after Sprint 3, as Liquibase changesets in
`src/main/resources/db/changelog/`.

```bash
mvn test                  # unit and slice tests; *IT tests need Docker
mvn spring-boot:run       # port 8080; env vars listed in manifest.env
```

In `docker compose` it is on host port 8094.

## Where the design lives

- Sprint 6 fixed the API in `contracts/trade-api.yaml`; our copy is
  `design/trade-api.yaml`, and the shared error envelope is
  `design/envelope-contract.md`.
- Sprint 7 asked us to publish `ORDER_PLACED` after the order is recorded. The
  topics and keys are justified in `design/kafka.md`.
- Where we depart from the contracts (for example `PARTIALLY_FILLED`), the
  reason is in `story_docs/contract-breach.md`.
