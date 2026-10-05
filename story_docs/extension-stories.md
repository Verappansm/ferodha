Extension Stories:

Work identified apart from the sprint stories, written in the same
format, for the record. These are not assessed sprint deliverables - they're
follow-on improvements the team decided were worth tracking properly.

Where one of these departs from a Neueda contract or sprint README, the
departure and its reason are recorded in `contract-breach.md` beside this file.

## Index

| ID | Change | Owner | Why | How it helps | Scope and status |
|---|---|---|---|---|---|
| LEAP-001 | Pre-commit hooks: gitleaks, hygiene hooks, shellcheck (plus ESLint/Prettier for `auth_service`) | Verappan, Shyam | Secrets and broken scripts were only being caught in review, after they were already in history | A leaked key or CRLF-broken script is blocked before the commit exists; nobody has to remember to check | Done. Every commit, all profiles |
| LEAP-002 | Simulated market data: synthetic, bounded ticks from real Fauxnance anchors (built in `trades_generator`, now `pricing_generator`) | Verappan | The Fauxnance quota (2000/day) is too small to demo a live-looking market, and there was nothing to trade against | A continuous, realistic `market-data` stream without spending the quota; one process owns the key under `market-sim` | Done. `market-sim` for pricing; tick publishing always |
| LEAP-003 | Order-book matching engine with partial fills | Verappan | Fill-or-reject against one quote never exercises a real book: no resting orders, no partial fills | Orders match price-then-time against each other, with affordability and holdings re-checked on both sides | Done. `market-sim` only |
| LEAP-004 | Synthetic liquidity (market-maker account), TTL expiry of resting orders, resting-side `trade-events` publish | Shruthi | LEAP-003 had nothing to match against, stale orders rested forever, and the resting side of a match published no event | The book has a counterparty, clears itself, and every filled order - both sides - reaches downstream consumers | Done. `market-sim` only |
| LEAP-005 | Refresh-token families: a replayed refresh token revokes only the login chain it belongs to | Simiritha | The contract revokes every refresh token the user holds, which signs a user out on every device when one device's token leaks | One compromised session is cut off without logging the user out everywhere, and the store records which chain diverged and when | Done. Auth service, always |
| LEAP-006 | Multi-currency trading with live FX rates from Fauxnance | | An INR account can hold US stocks, but placement compares a USD price with INR cash unconverted, and the executor converts USD/INR only, at a fixed 90 | A customer can trade on any supported exchange from an account in their own currency, charged at a real, recorded rate | Planned |
| LEAP-007 | Watchlists and price alerts, with the watchlist screen | | A customer can only follow instruments they already hold, and has no way to be told a price was crossed | Follow any instrument with live prices, and get told when a threshold is crossed without watching the screen | Planned (Neueda Sprint 10) |
| LEAP-008 | Customer notifications: in-app bell, toasts and the notification inbox | | A fill or a rejection happens after the HTTP response, and nothing tells the customer | Every order outcome and alert reaches the customer on the channel they chose, with an inbox to catch up | Planned (Neueda Sprint 10) |
| LEAP-009 | Portfolio and P&L, with the holdings screen | | Positions come back unpriced: quantity and average cost only | Market value, unrealised and realised profit and loss, and one total including cash | Planned (Neueda Sprint 10) |
| LEAP-010 | Customer preferences and the settings screen (password change, sign out everywhere, theme) | | Every feature that needs a customer choice (channel, default account, display currency) would invent its own copy | One owner for customer settings, with defaults when nothing is set | Planned (Neueda Sprint 10) |
| LEAP-011 | Account-opening approval: the admin approval screen and the endpoints behind it | | A registered user cannot log in until an account exists, and nothing opens one except seed data or SQL | A user requests an account, an admin approves it, and the user can trade, with every decision recorded | In progress: request filed at registration (Liquibase `008`); admin routes, approval and the console built (Liquibase `009`), not yet run against the stack |
| LEAP-012 | Public pages: registration and account-request status | | Registration exists only as an API, and a new user has no way to see why they cannot sign in yet | A visitor registers from the UI and can check whether their account is pending, approved or rejected | Planned |
| LEAP-013 | Forgotten password: scoping spike | | Nobody can recover an account without an administrator, but a reset flow is a high-risk feature to build carelessly | A written decision on whether and how to offer self-service reset, before any code | Planned (spike) |
| LEAP-014 | Client dashboard | | The dashboard route renders an empty page after sign-in | One screen with cash, today's P&L, recent orders and top positions | Planned |
| LEAP-015 | Market list and instrument search | | A customer must already know a ticker to trade, and there is no instrument endpoint | Search and filter the tradable instruments by exchange, sector and type | Planned |
| LEAP-016 | Instrument detail page | | There is nowhere to see a price, its history or the quote before trading | Chart, bid and ask, key statistics and news on one page, with buy and sell shortcuts into the ticket | Planned |
| LEAP-017 | Order ticket: cost, fees and confirmation | | The ticket submits straight away and shows no estimate of what the order will cost | The customer sees the estimated cost and fees and confirms before anything reaches the wire | Planned |
| LEAP-018 | Orders page: open orders and cancellation | | The contract's cancel route is not reachable from the UI, and history cannot be filtered | Open orders can be cancelled in place, and history can be filtered by status and date | Planned |
| LEAP-019 | Bank: deposit, withdrawal and transactions | | Cash can only change through seed data or settlement | A customer moves money between their bank and the trading account and sees every movement | Planned |
| LEAP-020 | Profile page | | A customer cannot see or correct the details held about them | Name, email, phone and account details in one place, with editable contact details | Planned |
| LEAP-021 | Admin: user and account management | | Suspending a user, closing an account or resetting credentials needs SQL | Administrators suspend, reactivate and close users and accounts and force a credential reset, with an audit trail | In progress: backend and console built, not yet run against the stack |
| LEAP-022 | Admin: instrument manager | | Listing or delisting an instrument needs SQL against `Instruments.tradable` | Administrators list and delist instruments from the UI, and a delisted instrument is refused at placement | In progress: backend and console built, not yet run against the stack |
| LEAP-023 | Admin: all orders and system health | | Operations has no cross-account view of orders and no single view of service health | One screen for every order on the platform and one for the health of every service | In progress: backend and console built, not yet run against the stack |
| LEAP-024 | Admin: client and advisor reports | | Reporting needs direct database access | Exportable summaries of client activity and assets | Optional |
| LEAP-025 | Common application shell: navigation, notifications, error, not-found and forbidden pages | | An unknown route renders nothing and a refused action has no page of its own | Every user lands on a page that says what happened and where to go next, with navigation that matches their role | Planned |
| LEAP-026 | Help and support page | | A customer with a problem has nowhere in the application to turn | Answers to common questions and a way to contact support | Optional |

Default profile (no `SPRING_PROFILES_ACTIVE`) is the spec-exact Sprint 6/7
behaviour; LEAP-002 to LEAP-004 change nothing there. LEAP-005 is in the auth
service and has no profile.

LEAP-007 onwards cover the trading UI beyond the Sprint 9 screens, together
with the backend each page needs. Pages for the advisor role are deliberately
out of scope for now; client and administrator pages come first. Every new
backend route is a package inside trade_api (or, for credentials, the auth
service), never a new service, and every new UI page follows the Sprint 9
engineering contract: standalone components, signals, generated clients, the
single bearer-token interceptor and a route guard.

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

 Frontend Tasks:

 Build the watchlist screen: one or more named lists, each instrument with
 its latest price and day change, added from search (LEAP-015) or the
 instrument page (LEAP-016) and removed in place.

 Manage alerts from the same screen: set an above or below threshold, see
 each alert's state (ACTIVE, TRIGGERED, CANCELLED) and cancel it.

 Refresh prices on a bounded interval while the screen is open, and say
 when a price is stale rather than showing it as live.

 # adding and removing an instrument updates the list without a reload
 # an alert threshold must be a positive price with at most two decimals

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

 Frontend Tasks:

 Put the bell and its unread count in the application shell (LEAP-025),
 and show a toast when a new notification arrives.

 Build the notification inbox: every notification newest first, unread
 ones marked, with mark-as-read for one or all, and a link from an order
 notification to that order on the orders page.

 Poll the unread count on a bounded interval and stop while the tab is
 hidden, so an idle tab is not a load test.

 # the unread count falls when a notification is marked read
 # an order notification links to that order

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

 Frontend Tasks:

 Build the portfolio screen: for each holding, quantity, average price,
 invested amount, market value, one-day return and total return, with
 realised and unrealised P&L and a total including cash.

 Show a stale quote as stale, with the time it was last priced.

 Feed the dashboard's today's P&L and top positions (LEAP-014) from the
 same endpoints, so the two screens never disagree.

 # an empty portfolio renders a readable empty state
 # gains and losses carry a sign and a word, not colour alone

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

 Frontend and Auth Tasks:

 Build the settings screen over this module: notification channel, display
 currency and theme (light, dark, follow the system).

 Change password: a new auth service route that requires the current
 password, applies the registration length rules, and revokes every other
 refresh-token family on success.

 Sign out everywhere: a protected auth route that revokes every refresh
 family the user holds (the device that asked signs out too), then clears
 the local session.

 Apply the theme without a reload and remember it per user.

 # a password change with the wrong current password is refused
 # signing out everywhere ends every other session at its next refresh
 # the chosen theme survives a reload

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

 Done: `account_requests` (user, currency, bank account, status
 PENDING/APPROVED/REJECTED, reason, decided_by, decided_at) is trade_api
 Liquibase `008`, and `/auth/register` files a PENDING request in the same
 transaction as the user.

 Report the request's status to the user without a session: a route that
 checks the user's email and password itself, since the user has no token
 until an account exists (consumed by LEAP-012).

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

 Frontend Tasks:

 Build the admin approval screen: pending requests oldest first, with the
 applicant's details, a bank account chosen at approval, approve, and
 reject with a required reason.

 Route the screen behind an ADMIN-only guard, and show the forbidden page
 (LEAP-025) to anyone else; the guard is usability, the trade_api role
 check is the control.

Team 2 - Public Pages: Registration and Account-Request Status (LEAP-012)


Description

Acceptance Criteria:

 * A visitor can register from the UI with an email, a display name and a
   password, and is told plainly that the account must be approved before
   they can sign in.
 * A registered user can check the state of their account request
   (pending, approved, or rejected with the reason) without a session.
 * Both pages are reachable signed out, and neither ever stores a token.

Tasks:

 Build the registration screen as a reactive form over the generated auth
 client: email, name, password and confirmation, with the service's own
 rules (a valid email, 12 to 128 characters) checked before submission.

 Wrap the generated `register` call in AuthApi so the contract's required
 `accountId` is never sent (contract-breach.md, B08); the departure stays
 in one place rather than at every call site.

 Map `AUTH-409` and `VAL-422` through the shared error catalogue.

 Build the status page over LEAP-011's status route: it asks for the email
 and password, shows the state, and on APPROVED offers sign-in.

 Unit Test Execution Paths:

 # a valid registration shows the awaiting-approval message
 # a taken email shows the AUTH-409 sentence
 # mismatched or short passwords are blocked before submission
 # each request state renders its own message

 Notes:

 * Registration returns no token, by contract and on purpose; the page must
   not try to sign the user in afterwards.

Team 2 - Forgotten Password: Scoping Spike (LEAP-013)


Description

Acceptance Criteria:

 * A written decision, recorded in `design/`, on whether the platform offers
   self-service password reset, and if so how.
 * No production code is written under this story.

Tasks:

 Compare three options: no self-service reset (an administrator forces a
 reset, LEAP-021); an emailed single-use reset link; and a reset gated on a
 second factor the platform already holds.

 For any emailed option, state how the email is sent in this environment,
 how long a link lives, that it is single use and stored hashed, that the
 response never reveals whether an email is registered, and that a
 successful reset revokes every refresh-token family.

 Estimate the work and the new attack surface, and recommend one option.

 Notes:

 * Reset is the most common route to account takeover. Deciding not to
   offer it is an acceptable outcome of this spike.

Team 2 - Client Dashboard (LEAP-014)


Description

Acceptance Criteria:

 * After sign-in the dashboard shows available cash, today's P&L, the most
   recent orders with their status badges, and the largest positions.
 * Each panel loads independently and shows its own loading, empty and
   error states; one failing panel never blanks the page.

Tasks:

 Read cash from the existing balance route, recent orders from order
 history, and today's P&L and top positions from LEAP-009's endpoints.

 Reuse the blotter's status badge and the Sprint 9 error catalogue rather
 than writing new ones.

 Link each panel to its full page: orders, portfolio, bank.

 Unit Test Execution Paths:

 # each panel renders its figures from the API response
 # a failed panel shows a readable message while the others still render
 # a new customer with no orders or positions sees helpful empty states

Team 2 - Market List and Instrument Search (LEAP-015)


Description

Acceptance Criteria:

 * A signed-in customer can list the tradable instruments, search them by
   ticker or name, and filter by exchange, sector and type.
 * Results are paged, and every result links to its instrument page.

Tasks:

 Add `GET /api/v1/instruments` to trade_api over the existing `Instruments`
 table (ticker, name, exchange, currency, type, sector, tradable), with
 query parameters for text, exchange, sector, type and paging. Delisted
 instruments are excluded for customers.

 Add `GET /api/v1/instruments/filters` returning the distinct exchanges,
 sectors and types, so the filter choices come from data, not a constant.

 Index the search columns, so a text search does not scan the table.

 Describe both routes in an OpenAPI extension kept beside `trade-api.yaml`,
 and generate the client from it like the others.

 Build the market list screen with a debounced search box and the filters
 reflected in the URL, so a filtered list can be bookmarked.

 Unit Test Execution Paths:

 # a text search matches ticker and name, case-insensitively
 # filters combine, and an empty result renders an empty state
 # a delisted instrument never appears for a customer

Team 2 - Instrument Detail Page (LEAP-016)


Description

Acceptance Criteria:

 * The page shows the instrument's latest quote (bid, ask, last), a price
   chart over a chosen range, key statistics and recent news.
 * Buy and Sell open the order ticket with the instrument and side filled
   in; nothing is submitted until the customer confirms.
 * The browser never calls Fauxnance; every figure comes through a
   platform service that holds the key server-side.

Tasks:

 Serve the latest quote, with its timestamp, from what the platform
 already consumes from `market-data`, through a trade_api route.

 Serve chart history from `Market_Data` (open, high, low, close per
 interval) over day, week, month and year ranges.

 Key statistics: day range, 52-week range and previous close, where the
 data has them; omit a figure rather than invent one.

 Scope news first: confirm whether Fauxnance offers it and what it costs
 against the 2000-a-day quota. If it does not, ship without the panel and
 say so.

 Build the page with an accessible chart: a text summary and a data table
 beside the graphic.

 Unit Test Execution Paths:

 # buy and sell open the ticket pre-filled with symbol and side
 # a stale quote is labelled stale with its time
 # a range change reloads the chart only

 Notes:

 * Decide with LEAP-006 and LEAP-009 which process holds the Fauxnance key.

Team 2 - Order Ticket: Cost, Fees and Confirmation (LEAP-017)


Description

Acceptance Criteria:

 * Before submission the ticket shows the estimated cost (quantity times
   limit price), the fees and the total, and for a buy the cash remaining.
 * Submission is a two-step action: review, then confirm.
 * The figures shown are the figures the platform charges; the UI never
   carries its own copy of a fee rule.

Tasks:

 Expose the fee schedule trade_executor applies through a trade_api route,
 so the UI reads the rule instead of copying it.

 Add a review step to the existing ticket showing every figure, with
 confirm and back.

 Keep one idempotency key per order from review to final response, and
 reuse it when the customer retries after a network failure, so a retry
 can never place a second order.

 Unit Test Execution Paths:

 # the estimate equals quantity times price plus the published fee
 # back returns to the ticket with every field kept
 # a retry after a network failure reuses the same idempotency key

Team 2 - Orders Page: Open Orders and Cancellation (LEAP-018)


Description

Acceptance Criteria:

 * Open orders (NEW, and PARTIALLY_FILLED under `market-sim`) are listed
   apart from finished ones, each with a cancel control.
 * Cancelling calls the contract's `DELETE /api/v1/orders/{id}` once, after
   a confirmation, and shows the outcome, including ORD-409 when the order
   finished first.
 * History can be filtered by status and date range.

Tasks:

 Build on the Sprint 9 blotter rather than beside it: the same badges and
 the same bounded re-read.

 Pass the status and date filters to the existing order-history query
 parameters (`status`, `from`, `to`).

 Give PARTIALLY_FILLED its own badge, so the blotter renders every status
 the API can return (contract-breach.md, B13).

 Unit Test Execution Paths:

 # cancelling an open order shows CANCELLED after the re-read
 # cancelling an order that has just filled shows the ORD-409 sentence
 # a status filter lists only that status

Team 2 - Bank: Deposit, Withdrawal and Transactions (LEAP-019)


Description

Acceptance Criteria:

 * A customer deposits from, and withdraws to, the bank account linked to
   their trading account, and the cash balance changes accordingly.
 * Every movement is recorded in `Transactions` and listed newest first.
 * A withdrawal larger than the available cash, or a deposit larger than
   the bank balance, is refused with a readable reason.

Tasks:

 Add deposit, withdrawal and transaction-list routes to trade_api over
 `Third_Party_Bank`, `Accounts` and `Transactions`, each move made in one
 database transaction with the account row locked.

 Require an idempotency key on every move, as orders do.

 Add the new error codes to an extension of the catalogue, record them in
 contract-breach.md, and map each to a sentence in the UI.

 Build the bank screen: balance, deposit and withdrawal forms validated
 before submission, and the transaction list.

 Unit Test Execution Paths:

 # a deposit moves cash from the bank to the account exactly once
 # a withdrawal above the available cash is refused and nothing moves
 # a repeated idempotency key does not move money twice

 Notes:

 * Cash reserved by open buy orders is not available to withdraw.

Team 2 - Profile Page (LEAP-020)


Description

Acceptance Criteria:

 * A signed-in customer sees their name, email, phone, role, trading
   account and joining date.
 * The customer can change their name and phone; the email is shown, and
   changing it is out of scope.

Tasks:

 Add a protected profile route to the auth service, which owns `Users`,
 reading the user from the verified token only.

 Build the profile screen with a reactive form for the editable fields.

 Unit Test Execution Paths:

 # the profile renders the details of the signed-in user only
 # an invalid phone number is blocked before submission

Team 2 - Admin: User and Account Management (LEAP-021)


Description

Acceptance Criteria:

 * An administrator can search users, see each user's status and accounts,
   suspend and reactivate a user, suspend and close an account, and force a
   credential reset.
 * A suspended user cannot sign in or refresh; a suspended or closed
   account cannot place or cancel orders (ACC-403).
 * Every action records the administrator, the time and a reason.

Tasks:

 Put user actions in the auth service, which owns `Users` and the refresh
 tokens, and account actions in trade_api, which owns `Accounts`, both
 under an admin prefix refused without the ADMIN role.

 Suspending a user revokes every refresh-token family it holds.

 A forced reset requires the user to change the password at the next
 sign-in (LEAP-010's change-password route); a password is never emailed
 or displayed.

 Build the management screens over both services.

 Unit Test Execution Paths:

 # a suspended user is refused at sign-in and at refresh
 # a closed account answers ACC-403 on placement
 # a CUSTOMER token cannot reach any admin route

 Notes:

 * Assigning advisors to clients belongs with the advisor pages, which are
   out of scope for now.

Team 2 - Admin: Instrument Manager (LEAP-022)


Description

Acceptance Criteria:

 * An administrator lists every instrument, tradable or not, and lists or
   delists one with a reason.
 * A delisted instrument answers INS-404 at placement and disappears from
   the customer market list; existing holdings in it are unaffected.

Tasks:

 Add admin routes in trade_api over `Instruments.tradable` (Liquibase
 `003`), recording who changed it and when.

 Build the instrument manager screen with the same search and filters as
 LEAP-015.

 Unit Test Execution Paths:

 # delisting stops new orders and leaves holdings in place
 # relisting makes the instrument tradable again

Team 2 - Admin: All Orders and System Health (LEAP-023)


Description

Acceptance Criteria:

 * An administrator sees every order on the platform, filterable by
   account, symbol, status and date, newest first.
 * A health screen shows whether each service (auth, trade API, trade
   executor, Kafka, Postgres) is up, with the time it was checked.

Tasks:

 Add a paged admin order query to trade_api; never reuse the customer
 route with its account check removed.

 Aggregate the existing health endpoints (`/actuator/health`, `/health`)
 behind one admin route, so the browser never calls internal services
 directly and no internal address reaches the bundle.

 Unit Test Execution Paths:

 # the admin order list spans every account and pages correctly
 # a service that does not answer shows as down, not as missing

Team 2 - Admin: Client and Advisor Reports (LEAP-024)


Description

Acceptance Criteria:

 * An administrator can export a summary of clients (accounts, cash,
   holdings value, orders in a period) as CSV.

Tasks:

 Build after LEAP-009 and LEAP-023, reusing their queries; consider the
 analytics star schema (`fact_trades_etl`) for anything historical.

 Notes:

 * Optional. Advisor reports wait for the advisor pages.

Team 2 - Common Application Shell (LEAP-025)


Description

Acceptance Criteria:

 * One navigation bar whose links match the signed-in role (customer or
   administrator), carrying the notification bell (LEAP-008).
 * An unknown route renders a not-found page, a route the role may not
   open renders a forbidden page, and an unexpected failure renders an
   error page. None of them is a blank screen.
 * Every page meets WCAG AA: keyboard navigation, visible focus, labelled
   controls and sufficient contrast.

Tasks:

 Add a wildcard route to the not-found page, a role guard that sends a
 refused visitor to the forbidden page, and a global error handler that
 shows the error page with a readable sentence and a way back.

 Lazy-load the customer and admin feature areas.

 Send an expired or rejected session (AUTH-401 on any call) back to
 sign-in carrying the return address, instead of leaving the page in an
 error state.

 Unit Test Execution Paths:

 # an unknown path renders the not-found page
 # a customer opening an admin route sees the forbidden page
 # an AUTH-401 on any call returns the user to sign-in

Team 2 - Help and Support Page (LEAP-026)


Description

Acceptance Criteria:

 * A help page answers the common questions (why an order is still in
   process, why sign-in waits for approval, how fees are worked out) and
   says how to contact support.

Tasks:

 Static content inside the application, reachable signed in or out.

 Notes:

 * Optional.
