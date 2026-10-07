# 0002 Limits are checked at the point of decision, and a disabled strategy stops now

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-10-07 |
| Decided by | the team |

## Context

A strategy spends money without a person confirming each order, so a defect
costs money rather than showing a wrong number. Kafka delivers at least once,
quotes can be delayed, and a customer who disables a strategy expects it to
stop immediately, not at the end of an evaluation cycle.

## Options considered

| Option | For | Against |
|---|---|---|
| Check limits when the strategy is created or enabled | Cheap | The state has moved by the time it fires |
| Check at the start of an evaluation cycle only | One read per cycle | A strategy disabled mid-cycle still places its order |
| **Check at the point of decision, every order** | Reads current state; disabling takes effect on the next order | One query per candidate order |

## Decision

Before each order the engine, in this order: ignores a quote older than 15
minutes; fires like a limit order (at once when the level is already met on the
first price seen after enabling, then only on a crossing, never a repeat on a
held level); checks max spend
(fee included, pending orders counted), max position (held plus pending buys)
and, for a SELL, units free of pending sells; then claims the order with one
guarded `UPDATE` that succeeds only while the strategy is ENABLED with orders
left. The order id key is `strat-<strategy>-<quote time>`, so the same quote
can only ever be one order.

A refusal by the customer's own cap is a BLOCKED event, not a failure. A
placement error, an executor rejection or an unexpected exception counts as a
failure; the strategy TRIPS after `maxFailures` in a row and stays stopped until
the customer re-enables it. A fill resets the count. When the order route fails
after saving the order (the broker was down when it published), the order is
looked up by its key and counted as placed, so it cannot be placed twice.

Disabling also cancels the strategy's working orders. A dry run logs
WOULD_FIRE and places nothing. A SELL strategy can only be created for stock
the account holds, and the engine re-checks the free units at every order. The
price a strategy last watched, and when, is kept on the row so the customer can
see it is alive (a WATCHING event says what it is waiting for).

## Consequences

- Every decision leaves a line in the strategy's activity log.
- The 15 minute quote age and the 0.02% limit buffer are configuration
  (`strategy.max-quote-age-seconds`) and a constant (`TriggerRule`).
- Not built, deliberately: a daily loss limit, an order-rate cap beyond
  `maxOrders`, and customer notifications on a trade or a trip.
