# kafka_pipeline

Scripts that create the Sprint 7 topics on the broker: `orders`,
`trade-events` and `market-data`, plus their `.DLT` dead-letter topics. Both
are safe to run more than once.

```bash
./create_topics.sh
./create_dlt_topics.sh
```

## Where the design lives

Sprint 7 asked us to record why the partition counts and keys are what they
are, and to name the command that creates the topics. That is
`design/kafka.md`. Step-by-step broker setup and verification is in
`design/kafka-topic-setup.md`.
