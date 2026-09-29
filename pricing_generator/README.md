# pricing_generator

Simulated market data. It fetches real Fauxnance candles and batched quotes
for the watched symbols, publishes a bounded synthetic tick to `market-data`
every few seconds, and serves the latest quote over HTTP. Under `market-sim`
it is the only process that holds `FAUXNANCE_API_KEY`.

```bash
mvn test
mvn spring-boot:run       # port 8084; env vars listed in manifest.env
```

Not part of any Neueda sprint: it is our own extension, split out of
`trades_generator`. Why it exists is in `story_docs/extension-stories.md`
(LEAP-002). Taking the key away from the executor is recorded in
`story_docs/contract-breach.md`.
