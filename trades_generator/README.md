# trades_generator

Synthetic order liquidity for the `market-sim` profile. It places
`RANDOMIZER` orders through the seeded market-maker account, priced at the
current tick from `pricing_generator`, so a portal order has something to
match against.

```bash
mvn test
mvn spring-boot:run       # port 8083
```

Not part of any Neueda sprint: it is our own extension. Why it exists and what
it does are in `story_docs/extension-stories.md` (LEAP-004). The contract
departures it causes are in `story_docs/contract-breach.md`.
