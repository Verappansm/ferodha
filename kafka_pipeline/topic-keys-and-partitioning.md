# Topic Keys and Partition Counts

**Status:** Confirmed against `kafka_contract.md`
**Owners:** Whole Sprint 7 team — per the contract, any member must be able to defend
these choices at review, so this isn't attributed to a single author.

## 1. What exists

| Topic | Partitions | Replication | Retention | Key |
|---|---:|---:|---:|---|
| `orders` | 3 | 1 locally, 3 in a real cluster | 7 days | `accountId` as a string |
| `trade-events` | 3 | 1 locally, 3 in a real cluster | 30 days | `accountId` as a string |
| `market-data` | 6 | 1 locally, 3 in a real cluster | 1 day | `symbol` |
| `orders.DLT` | 1 | 1 | broker default (not specified by contract) | n/a |
| `trade-events.DLT` | 1 | 1 | broker default (not specified by contract) | n/a |
| `market-data.DLT` | 1 | 1 | broker default (not specified by contract) | n/a |

This matches `kafka_contract.md` exactly, and matches what `create_topics.sh` /
`create_dlt_topics.sh` actually create. Replication factor 1 is correct for local; the
contract calls for 3 in a real cluster, so `create_topics.sh` needs a
`--replication-factor` argument added before it's ever pointed at a multi-broker cluster
— currently it's hardcoded to 1.

**Naming note:** the wider spec calls the first topic `trades`. `kafka_contract.md`
deliberately names it `orders` instead, because everything on it is an accepted order
awaiting execution, not a completed trade. `trades` is accepted terminology where another
team has already built against it, but this repository uses `orders` — don't let the two
names drift into meaning different things in conversation.

The contract also fixes something implicit in the scripts: `orders` has exactly **one**
consumer group (`trade-executor`). It's a work queue, not an event log — a second
consumer group would mean two services executing the same order. This is why 3 partitions
was chosen for `orders`: it's sized to let 3 executor instances run in one group, which is
also enough to demonstrate that a consumer group can't usefully exceed its partition
count. `trade-events` is an event log with many independent consumer groups instead, and
`market-data`'s 6 partitions reflect its higher message rate, not a consumer-count target.

## 2. Why the key decides the partition, and the partition decides the ordering

Kafka's producer-side partitioner is deterministic:

```
partition = hash(key) % num_partitions
```

Two messages with the same key always land on the same partition, and Kafka only
guarantees ordering **within a single partition** — never across partitions, and never
across the whole topic. So in practice:

- The **key** decides which partition a message goes to.
- The **partition** is the only unit Kafka orders anything within.
- Therefore the key is the actual unit of the ordering guarantee. Two messages only have
  a guaranteed relative order if they share a key. Nothing else — not send time, not
  topic, not the producer — gives you ordering.

This is why the key isn't a formatting or "how do we shard" concern. It's a correctness
decision: pick the key wrong and you've picked what's allowed to reorder.

## 3. Why `orders` and `trade-events` are keyed by account, not order ID

An account can have multiple orders in flight, and downstream consumers (risk checks,
position/exposure calculation, audit trail) need to see that account's events — across
all of its orders — in the order they actually happened. Example: an order is placed,
then cancelled, then a *different* order on the same account is placed and filled. A
position/risk consumer needs those four events in that sequence to compute the account's
state correctly.

If we keyed by **order ID** instead:

- Each order's own events (created → filled → settled) would still be ordered relative
  to each other, since they share an order ID.
- But events belonging to *different orders on the same account* would hash to
  effectively random partitions, with no guaranteed order between them.
- Any consumer that needs account-level truth (risk, exposure, audit) would be
  reconstructing order across partitions from timestamps alone — which is exactly the
  guarantee Kafka was supposed to give them for free, and timestamps are not a reliable
  substitute (clock skew, retries, out-of-order delivery from producer buffering).

So keying by order ID looks more "granular" but actually throws away the one guarantee
the account-level consumers depend on. Account is the correct key because account is the
scope the ordering guarantee needs to hold over.

`market-data` is keyed by symbol for the same reason at a different scope: a symbol's own
tick sequence needs to be ordered; there's no cross-symbol ordering requirement to
preserve, so symbol is both necessary and sufficient as a key.

## 4. Why partition counts are fixed now, not adjusted later

Partitions can be **increased**, never decreased. Increasing partition count changes the
denominator in `hash(key) % num_partitions`, which changes which partition a given key
maps to. Concretely: if `orders` goes from 3 → 6 partitions, an account whose messages
all used to land on partition 1 will, after the change, have **new** messages hash to a
different partition while its **old** messages stay where they were written. The
account's history is now split across two partitions with no ordering relationship
between the two halves — a consumer reading "this account's history" no longer gets it
in one ordered stream.

Consequence: partition count is not a tuning knob to revisit casually. It has to be right
(or over-provisioned with margin) at creation time, because "fix it later by adding
partitions" silently breaks ordering for every key that was already in use. The counts in
the table above (3 / 3 / 6) are the ones `kafka_contract.md` fixes, sized to projected
throughput and consumer-group shape (see §1) — not a "start low, scale up later"
placeholder.

## 5. Why the DLT topics are 1 partition and created explicitly

Auto-creation was rejected because it silently produces a 1-partition topic with default
retention and no signal that it happened — you find out during an incident, not before
one. The DLT topics here are also 1 partition, but that's a **deliberate choice**, not
the auto-create default in disguise, because:

- DLQs hold poison/failed messages for manual inspection and replay, not real-time
  ordered consumption. There's no ordering guarantee to preserve across a dead-letter
  stream.
- Volume is expected to be low relative to the source topic (only failures land here), so
  a single partition isn't a throughput bottleneck.


## 6. Where the creation commands live and what runs them

- Scripts: `kafka_pipeline/create_topics.sh` and `kafka_pipeline/create_dlt_topics.sh`,
  on the Linux Docker host (see `kafka_setup.md`).
- Execution: manual, via SSH into the Linux host, `./create_topics.sh` then
  `./create_dlt_topics.sh`. Not currently wired into CI or a bootstrap step.
- Idempotency: both scripts use `--if-not-exists`, so rerunning is safe and won't error
  on topics that already exist — this is what makes "record it so anyone can rerun it"
  actually true rather than aspirational.
