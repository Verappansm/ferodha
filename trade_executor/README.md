# trade_executor

The Trade Executor (Spring Boot, Sprint 7). It consumes `ORDER_PLACED` from
`orders`, prices the order, fills or rejects it, settles cash and position in
one transaction, and publishes `ORDER_FILLED` / `ORDER_REJECTED` to
`trade-events`. Under the default profile it also runs the market-data poller.

```bash
mvn test
mvn spring-boot:run       # port 8081 by default (8082 in compose and on Windows)
```

`SPRING_PROFILES_ACTIVE=market-sim` switches on the order-book matching engine,
partial fills and TTL expiry of resting orders.

## Where the design lives

- Sprint 7 asked us to record the topic, key and partition choices, and the
  command that creates the topics: `design/kafka.md` and
  `design/kafka-topic-setup.md`. The event envelope is in
  `design/envelope-contract.md`.
- The `market-sim` work (LEAP-003, LEAP-004) is in
  `story_docs/extension-stories.md`.
