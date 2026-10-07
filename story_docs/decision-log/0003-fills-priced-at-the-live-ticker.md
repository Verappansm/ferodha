# 0003 Orders fill at the live ticker price, not at a Fauxnance quote fetched per order

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-10-07 |
| Decided by | the team |

## Context

The executor used to price each fill with one real Fauxnance quote fetched when
the order arrived. Everything a customer sees (the market list, the order
ticket's suggested price, charts, portfolio values, strategy triggers) comes
from pricing_generator's live ticker, a random walk around the real quote that
drifts from it by up to the day's range. A limit price chosen from what is on
screen could therefore sit on the wrong side of the real quote, and the order
was rejected NOT_MARKETABLE although it looked fair. It also spent one
Fauxnance request per order.

## Options considered

| Option | For | Against |
|---|---|---|
| Keep a real quote per order | Fills at the real market price | Screen and fill disagree; a quota unit per order; a strategy firing on the ticker is rejected |
| Make the ticker publish the real quote unchanged | Screen and fill agree, and both are real | The 1D chart moves only when the quote refreshes; loses the live feel |
| **Fill at the live ticker** | Screen, suggestion, strategy trigger and fill are one number; no per-order quota | The price is simulated around the real anchor, not the real quote |

## Decision

The executor prices every fill at pricing_generator's current tick, under every
profile (`TradesGeneratorQuoteSource`, `TRADES_GENERATOR_URL`). The rule is
unchanged: a BUY fills at the ask if its limit is at or above it, a SELL at the
bid if its limit is at or below it, otherwise NOT_MARKETABLE; with no tick yet
the order is rejected PRICE_UNAVAILABLE. The order ticket says so in plain
words. The direct-to-Fauxnance client is kept as code behind the profile
`fauxnance-direct` and is off by default.

## Consequences

- A limit price taken from the screen or the ticket's suggestion fills.
- The executor needs no `FAUXNANCE_*` settings by default.
- Fills are only as live as pricing_generator: if it is down, orders are rejected
  PRICE_UNAVAILABLE rather than priced on something stale.
