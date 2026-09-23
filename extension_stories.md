Extension Stories:

Work identified apart from the sprint stories, written in the same
format, for the record. These are not assessed sprint deliverables - they're
follow-on improvements the team decided were worth tracking properly.

Team 2 - Pre-Commit Hooks on the Repository (LEAP-001)


Description

Acceptance Criteria:

 * A `pre-commit` config exists at the repo root and every hook in it runs
   locally on `git commit`, not only in CI.
 * Committing a file containing something that looks like a credential
   (an API key, a JWT secret, a `.env` file itself) is blocked before the
   commit is created, not caught after the fact in review.
 * Every `.sh` script in the repository passes `shellcheck` with no
   unaddressed warnings, enforced on commit.
 * Basic hygiene - trailing whitespace, missing final newline, an
   accidentally committed merge-conflict marker, a YAML file that doesn't
   parse - is caught before the commit lands, not discovered later by a
   teammate pulling it.

Tasks:

 Install the `pre-commit` framework (https://pre-commit.com) and commit a
 `.pre-commit-config.yaml` at the repo root, since it already covers every
 language in this repo (Java, Python, shell, YAML) with one tool rather than
 three.

 Add the standard `pre-commit-hooks` set: `trailing-whitespace`,
 `end-of-file-fixer`, `check-merge-conflict`, `check-added-large-files`,
 `check-yaml`.

 Add `detect-secrets` (or `gitleaks`) as a secret-scanning hook. The `JWT_SECRET`
 and `FAUXNANCE_API_KEY` are read from the
 environment and must never appear in a committed file - a pre-commit hook
 is what actually enforces that instead of relying on everyone remembering.

 Add `shellcheck` against `database/apply.sh`, `database/scripts/check.sh`,
 `kafka_pipeline/create_topics.sh`, `kafka_pipeline/create_dlt_topics.sh`,
 and `SB_AND_KAFKA_DEMO.sh`.

 Document how to install it (`pip install pre-commit && pre-commit install`)
 in the repo's own README.md.

 Notes:

 * Keep it fast. A hook slow enough that people start passing `--no-verify`
   is worse than no hook, because now nobody trusts the ones that are left.
 * A Java-side hook (Spotless/Checkstyle run before commit) was considered
   and deliberately left out of this story's scope - `mvn` invocations are
   slow enough on a cold JVM that they belong in CI or a pre-push hook, not
   pre-commit. Worth its own story if the team wants it.

Team 2 - Trades Generator: Simulated Market Data (LEAP-002)


Description

Acceptance Criteria:

 * A new `trades_generator` service exists, sibling to `trade_api` and
   `trade_executor`, and is the only process holding `FAUXNANCE_API_KEY`
   under the `market-sim` profile.
 * It fetches daily candles and five-minute batched quotes for watched
   symbols, and publishes a bounded synthetic tick every five seconds to
   `market-data`, regardless of which profile `trade_executor` runs under.
 * Under `market-sim`, `trade_executor` prices fills from this service
   instead of Fauxnance directly. Under the default profile, nothing
   about `trade_executor` changes.

Tasks:

 Set `trades_generator` up as its own Maven/Spring Boot project, joined
 to `docker-compose.yml`. Reuse `PollableSymbolMapper`'s watched-symbols
 query and `PollScheduleCalculator`'s quota arithmetic rather than
 reinventing either.

 Write `RandomizerModel` as a pure, bounded, mean-reverting tick
 generator - clamped to the day's candle range, spread never narrower
 than the real quote's own.

 Add `TradesGeneratorQuoteSource`, `@Profile("market-sim")`, as the
 alternative to `FauxnanceQuoteClient` (`@Profile("!market-sim")`).
 Disable `trade_executor`'s own `MarketDataPoller` under `market-sim` so
 only one process ever spends the Fauxnance quota.

 Unit Test Execution Paths:

 # a tick with zero noise reverts toward the real anchor
 # a tick is always clamped inside the candle bounds, however large the noise
 # the correct QuoteSource is selected per profile

 Notes:

 * No frontend exists yet to consume the tick - this story only
   guarantees it's published correctly, at the right cadence.

Team 2 - Order-Book Matching Engine: Partial Fills Behind a Profile Switch (LEAP-003)


Description

Acceptance Criteria:

 * Under the default profile, order execution is unchanged - no partial
   fills, no new columns touched on the hot path.
 * Under `market-sim`, an order matches against resting opposite-side
   orders first, price-then-time priority, executing at the resting
   order's own price.
 * A match can fill an order fully or partially; whatever doesn't cross
   simply rests, the way a real limit order sits in a book.
 * A partially-filled order can still be cancelled for its remainder.
 * Every match re-checks affordability/holdings on both sides and moves
   fee- and currency-converted cash on both sides.

Tasks:

 Add `Orders.source`, `Orders.filled_quantity`, and re-add
 `PARTIALLY_FILLED` to `order_status_enum`, additively this time.

 Add the resting-book query and two guarded updates (resting order,
 incoming order), following this codebase's own optimistic-lock
 convention rather than row locking.

 Write `OrderBookMatcher`, reusing `ExecutionRuleCheck`,
 `FeeCalculator` and `CurrencyConverter` the same way
 `OrderExecutionService` already does for the non-matching path.

 Extend `cancelIfNew` to accept `PARTIALLY_FILLED`; add the same literal
 to `trade_api`'s `OrderStatus` Java enum so order-history reads don't
 throw on a genuinely partially-filled row.

 Gate all of it behind `executor.matching.enabled`, on only under
 `market-sim`.

 Unit Test Execution Paths:

 # two crossing orders fully match, at the resting order's price
 # a partial match leaves the remainder resting
 # a contended or no-longer-affordable resting order is skipped, not force-matched
 # an incoming order that can't afford its own worst case is rejected before the book is queried

Team 2 - Synthetic Liquidity, TTL Expiry & the Resting-Order Publish Gap (LEAP-004)


Description

Acceptance Criteria:

 * A resting order that gets matched now publishes its own `trade-events`
   message too, not just the incoming order (closes LEAP-003's known gap).
 * A limit order with no crossing counterparty is eventually cancelled by
   a TTL sweep, under `market-sim` only.
 * `trades_generator` places real synthetic counter-orders through a
   seeded market-maker account, so a portal order under `market-sim` has
   something to actually match against.
 * `SPRING_PROFILES_ACTIVE=market-sim` reaches every service that needs
   it, and the demo script can show the difference live.

Tasks:

 Publish from `OrderBookMatcher` itself, right after each successful
 `settleMatch`, using that match's own price/fee - not a new method on
 `SettlementService`, keeping publish-after-commit ordering intact.

 Add `OrderExpiryScheduler` (trade_executor, `market-sim` only),
 self-rescheduling the same way `MarketDataPoller` already does. Found
 and fixed a real race while adding it: `matchRestingOrderIfUnchanged`'s
 guard only checked `filled_quantity`, not `status`, so a concurrent
 match could have re-filled an order this sweep had just cancelled.

 Seed one market-maker `Account` via Liquibase (`006-market-maker-
 account.sql`) - large cash balance, large seeded holdings per tradable
 instrument, so it passes `OrderBookMatcher`'s normal affordability/
 holdings checks like any other account, no special-casing needed.

 Add `trades_generator`'s `OrderGenerator` (`market-sim` only): places
 `RANDOMIZER`-source orders through that account, priced at the live
 tick's own bid/ask, published to `orders` exactly the way trade_api's
 own `OrderController` does.

 Fixed `docker-compose.yml`: `trades-generator`'s service block never
 forwarded `SPRING_PROFILES_ACTIVE` - setting it only ever reached
 trade_executor, so trades_generator would silently never place a
 synthetic order no matter what the env var said. Documented the var in
 `.env.example`, which never mentioned it either.

 Added `SB_AND_KAFKA_DEMO.sh` Section 6: places a portal order priced to
 cross a synthetic one, polls for `PARTIALLY_FILLED`/`FILLED`, and
 explains itself honestly when the stack isn't running market-sim rather
 than silently doing nothing.

 Unit Test Execution Paths:

 # OrderBookMatcher publishes the resting side on a match, not just the incoming order
 # a contended resting order is never published
 # a sweep past the configured TTL cancels a stale resting order
 # a failed sweep logs and retries next cycle rather than propagating
 # OrderGenerator skips a symbol with no tick yet, or no market-maker resolved yet
 # a generated order's price is always the tick's own bid or ask, quantity within the configured range

 Notes:

 * The market-maker's seeded holdings only cover instruments tradable at
   migration time - one added afterward has no seeded inventory to sell
   from until someone extends the seed.
 * No REST field currently exposes `source` or `filled_quantity` on an
   order - the demo script can only show `status`, not who the
   counterparty was or how much filled. Left as-is rather than changing
   the Sprint 6 contract unprompted.
