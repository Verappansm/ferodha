Extension Stories:

Work identified apart from the sprint stories, written in the same
format, for the record. These are not assessed sprint deliverables - they're
follow-on improvements the team decided were worth tracking properly.

Where one of these departs from a Neueda contract or sprint README, the
departure and its reason are recorded in `contract-breach.md` beside this file.

## Index

| ID | Change | Owner | Why | How it helps | Scope and status |
|---|---|---|---|---|---|
| LEAP-001 | Pre-commit hooks: gitleaks, hygiene hooks, shellcheck (plus ESLint/Prettier for `auth_service`) | | Secrets and broken scripts were only being caught in review, after they were already in history | A leaked key or CRLF-broken script is blocked before the commit exists; nobody has to remember to check | Every commit, all profiles |
| LEAP-002 | Simulated market data: synthetic, bounded ticks from real Fauxnance anchors (built in `trades_generator`, now `pricing_generator`) | | The Fauxnance quota (2000/day) is too small to demo a live-looking market, and there was nothing to trade against | A continuous, realistic `market-data` stream without spending the quota; one process owns the key under `market-sim` | `market-sim` for pricing; tick publishing always |
| LEAP-003 | Order-book matching engine with partial fills | | Fill-or-reject against one quote never exercises a real book: no resting orders, no partial fills | Orders match price-then-time against each other, with affordability and holdings re-checked on both sides | `market-sim` only |
| LEAP-004 | Synthetic liquidity (market-maker account), TTL expiry of resting orders, resting-side `trade-events` publish | | LEAP-003 had nothing to match against, stale orders rested forever, and the resting side of a match published no event | The book has a counterparty, clears itself, and every filled order - both sides - reaches downstream consumers | `market-sim` only |
| LEAP-005 | Refresh-token families: a replayed refresh token revokes only the login chain it belongs to | | The contract revokes every refresh token the user holds, which signs a user out on every device when one device's token leaks | One compromised session is cut off without logging the user out everywhere, and the store records which chain diverged and when | Auth service, always |
| LEAP-006 | Multi-currency trading with live FX rates from Fauxnance | | An INR account can hold US stocks, but placement compares a USD price with INR cash unconverted, and the executor converts USD/INR only, at a fixed 90 | A customer can trade on any supported exchange from an account in their own currency, charged at a real, recorded rate | Planned |
| LEAP-007 | Watchlists and price alerts | | A customer can only follow instruments they already hold, and has no way to be told a price was crossed | Follow any instrument with live prices, and get told when a threshold is crossed without watching the screen | Planned (Neueda Sprint 10) |
| LEAP-008 | Customer notifications: in-app bell and toasts | | A fill or a rejection happens after the HTTP response, and nothing tells the customer | Every order outcome and alert reaches the customer on the channel they chose, with an inbox to catch up | Planned (Neueda Sprint 10) |
| LEAP-009 | Portfolio and P&L | | Positions come back unpriced: quantity and average cost only | Market value, unrealised and realised profit and loss, and one total including cash | Planned (Neueda Sprint 10) |
| LEAP-010 | Customer preferences and settings | | Every feature that needs a customer choice (channel, default account, display currency) would invent its own copy | One owner for customer settings, with defaults when nothing is set | Planned (Neueda Sprint 10) |
| LEAP-011 | Admin console and account-opening approval | | A registered user cannot log in until an account exists, and nothing opens one except seed data or SQL | A user requests an account, an admin approves it, and the user can trade, with every decision recorded | Planned |

Default profile (no `SPRING_PROFILES_ACTIVE`) is the spec-exact Sprint 6/7
behaviour; LEAP-002 to LEAP-004 change nothing there. LEAP-005 is in the auth
service and has no profile.

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
 and `scripts/demo.sh`.

 Add a local hook running `auth_service`'s own ESLint config (Prettier
 included) on staged TypeScript, and force LF for `*.ts`/`*.js`/`*.json` in
 `.gitattributes` so a Windows checkout does not fail Prettier.

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

(Pricing has since moved out of `trades_generator` into its own
`pricing_generator` service; `trades_generator` keeps only the synthetic
orders of LEAP-004.)


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

 Added `scripts/demo.sh` Section 6: places a portal order priced to
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

Team 2 - Refresh-Token Families: Revoke the Chain, Not the User (LEAP-005)


Description

Acceptance Criteria:

 * Every login starts a new chain (family) of refresh tokens, and every
   refresh adds the replacement token to the same family.
 * A refresh token presented after it was already exchanged, or after it
   was revoked, answers AUTH-401 and revokes every token in its family.
 * The same user's other families (other devices, other logins) keep
   working.

Tasks:

 Store `family_id` on each `auth_refresh_tokens` row, set from a fresh UUID
 at login and carried over on refresh.

 Spend a token with a conditional `UPDATE ... WHERE used_at IS NULL AND
 revoked_at IS NULL`, so two concurrent exchanges of one token cannot both
 succeed; the loser is treated as reuse.

 On reuse, revoke the family and log the family and user id.

 Unit Test Execution Paths:

 # an already-exchanged token answers AUTH-401 and revokes its family
 # the user's other login chains are left alone
 # exactly one of two concurrent exchanges of the same token succeeds

 Notes:

 * Deliberate departure from contracts/auth-api.yaml, which revokes every
   refresh token for the user - see contract-breach.md (B03) and A04 in the
   security review for the residual risk.

Team 2 - Multi-Currency Trading with Live FX Rates (LEAP-006)


Description

Acceptance Criteria:

 * A customer whose account is in one currency (say INR) can buy or sell
   an instrument quoted in another (say a USD stock on NASDAQ).
 * Affordability at placement and the cash movement at settlement both
   use a live FX rate from Fauxnance, never a hard-coded number.
 * The rate used is recorded on the trade, so a statement can show what
   the customer was charged and why.
 * A pair Fauxnance cannot price, or a rate too old to trust, rejects the
   order with a reason; it never falls back to a guessed rate.

Tasks:

 Plan first: this story needs a design review before any code. Today
 `Accounts.currency` and `Instruments.currency` exist (both default USD),
 trade_api's rule 6 compares `quantity x price` against cash with no
 conversion, and trade_executor's `CurrencyConverter` knows only USD/INR
 at a fixed 90.

 Decide who fetches rates. Only one process may hold `FAUXNANCE_API_KEY`,
 so trade_api cannot call Fauxnance itself. Proposed: the market-data
 poller (pricing_generator under `market-sim`) adds the FX pairs in use to
 its batched quote call and publishes each rate to `market-data`, keyed by
 pair; trade_api and trade_executor each keep the latest rate per pair
 from that topic.

 Confirm Fauxnance's FX symbol format and quota cost from its `/v1/docs`
 before building. FX is listed as covered; the exact symbol is not known
 yet.

 Decide which side of the FX quote is used (buying USD with INR is the
 ask), the rounding, and the maximum age of a rate.

 Replace `CurrencyConverter`'s fixed table with the live rate, and convert
 in trade_api's rule 6 too, so placement and settlement agree.

 Add `fx_rate` and `fx_rate_as_of` to the trade record; keep
 `executed_price` and average cost in the instrument's own currency.

 Unit Test Execution Paths:

 # an INR account buying a USD stock is charged price x quantity x rate, in INR
 # placement and settlement use the same rate source
 # an unknown pair or a stale rate rejects the order with its own reason
 # same-currency orders are unaffected

 Notes:

 * Portfolio totals (LEAP-009) need the same rates to show one total.

Team 2 - Watchlists and Price Alerts (LEAP-007)


Description

Acceptance Criteria:

 * A customer can add any tradable instrument to a watchlist, including
   one they have never traded, and see its latest price beside it.
 * A customer can set an alert for a price crossing above or below a
   threshold, see its state, and cancel it.
 * A crossed threshold triggers once and is handed to notifications
   (LEAP-008) for delivery; an alert written only to a log does not count.

Tasks:

 Build as a package inside trade_api, with its own tables and routes, as
 Neueda's Sprint 10 brief requires (no new service or container).

 Consume `market-data` with a consumer group of its own, and check every
 quote against the active alerts for its symbol. Under the default profile
 the executor's poller produces those quotes; under `market-sim`,
 pricing_generator does.

 Feed watched symbols into the poller's watched-symbols query, so an
 instrument that is watched but not held actually gets quotes.

 Move an alert from ACTIVE to TRIGGERED with a guarded update, so two
 quotes arriving together cannot notify twice.

 Do not consume `orders` or `trade-events`.

 Unit Test Execution Paths:

 # a quote crossing the threshold triggers the alert once
 # a quote on the wrong side does nothing
 # a cancelled alert never triggers
 # a customer cannot read or change another customer's watchlist

Team 2 - Customer Notifications: Bell and Toasts (LEAP-008)


Description

Acceptance Criteria:

 * Every ORDER_FILLED, ORDER_REJECTED and ORDER_CANCELLED on
   `trade-events`, and every triggered alert, becomes a notification for
   the account's customer.
 * The UI shows a toast when one arrives and a bell with an unread count;
   opening the bell lists the history, and a message can be marked read.
 * The channel comes from preferences (LEAP-010), never a constant.

Tasks:

 Scope Kafka first. Needed: consuming `trade-events` with its own group,
 because that is where order outcomes already are. Not needed: a new
 topic. Alerts from LEAP-007 arrive in-process through a delivery
 interface, and the browser reads notifications over REST (polling
 `GET /notifications?unread=true`, or server-sent events later). A browser
 cannot read Kafka, so a topic would add nothing there.

 Build as a package inside trade_api: a `notifications` table (account,
 type, message, created, read) and a `NotificationService` interface that
 LEAP-007 calls.

 Treat `IN_APP` (bell and toast) as a real channel. Email or SMS may be a
 logging stub, as long as the routing decision is real and recorded.

 Deduplicate on the event's `eventId`, so a redelivered event does not
 notify twice.

 Unit Test Execution Paths:

 # a filled order produces exactly one notification, even if redelivered
 # the channel used is the one preferences returns
 # a customer only ever sees their own notifications

Team 2 - Portfolio and P&L (LEAP-009)


Description

Acceptance Criteria:

 * The routes, fields, error codes and staleness rules of Neueda's
   `contracts/portfolio-api.yaml` are implemented as written.
 * Every holding shows quantity, average cost, market value and
   unrealised P&L; the account shows realised P&L and a total including
   cash.
 * A missing or stale quote is shown as stale, never as live, and never
   blocks trading.

Tasks:

 Build as a package inside trade_api on the contract's routes
 (`/api/v1/portfolio/{accountId}`, `/positions`, `/pnl`).

 Read holdings from what already exists: `Positions_View` in
 `database/migrations/001_initial_schema.sql` and the positions query in
 `PositionMapper.xml`. Cash comes from `Accounts`.

 Price holdings with batched quotes (up to 25 symbols per call), cached.
 Decide together with LEAP-006 who holds the Fauxnance key: the Neueda
 brief has this module calling Fauxnance, while the architecture page
 names the executor as the only key holder.

 Book realised P&L from `trade-events` at the moment of each sale, and
 never recompute it.

 Express totals in one currency using LEAP-006's rates, or restrict the
 module to one currency and say so, as the contract allows.

 Unit Test Execution Paths:

 # unrealised P&L = (price - average cost) x quantity
 # a stale quote is flagged stale, and the total still returns
 # realised P&L is booked once per sale

Team 2 - Customer Preferences and Settings (LEAP-010)


Description

Acceptance Criteria:

 * A customer can read and change their settings: notification channel,
   default account, display currency.
 * A customer who has never saved anything gets defined defaults, and
   nothing is written to the table until the customer changes a setting.
 * Other modules read a preference through one interface, never the table.

Tasks:

 Build as a package inside trade_api. It is first of the Sprint 10
 modules, because notifications resolves its channel through it.

 Publish a `PreferencesService` Java interface on day one, with a stub
 behind it, so LEAP-008 can build against it straight away.

 Store one row per user holding only what they changed, and merge it with
 the defaults on read.

 No Kafka: this module consumes and produces nothing.

 Unit Test Execution Paths:

 # a new customer reads the defaults
 # a saved value overrides only that setting
 # the default account must be one the customer owns

Team 2 - Admin Console and Account-Opening Approval (LEAP-011)


Description

Acceptance Criteria:

 * A registered user can request a trading account without holding a
   session, and see the state of that request.
 * An admin can list pending requests, approve one (which opens the
   `Accounts` row for that user) or reject it with a reason.
 * After approval the user can log in and trade; every decision records
   the admin who made it and when.

Tasks:

 Add `account_requests` (user, currency, bank account, status
 PENDING/APPROVED/REJECTED, reason, decided_by, decided_at).

 Let the request be made at registration, or through a request endpoint
 that checks the user's email and password itself, since the user has no
 token until an account exists.

 Give admins a way in. Every access token must carry an integer accountId,
 so either give each admin an operations account, or define a separate
 admin token and route prefix that trade_api checks for the ADMIN role.
 Decide which, and record it in contract-breach.md.

 Put the admin routes under their own prefix, refused to anyone without
 ADMIN, and build an admin screen in the UI.

 Opening the account inserts the `Accounts` row in trade_api, the owner
 of that table; the auth service only reports the request's status.

 Unit Test Execution Paths:

 # a request is PENDING until an admin decides
 # approving opens exactly one account and lets the user log in
 # a CUSTOMER token cannot reach any admin route
 # a rejected request records who rejected it and why
