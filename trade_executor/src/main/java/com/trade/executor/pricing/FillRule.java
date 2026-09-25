package com.trade.executor.pricing;

import com.trade.executor.domain.RejectionReason;
import com.trade.executor.enums.OrderSide;

// The default fill rule: a pure function of an order and a quote, returning
// a decision. Touches no database and no socket - both callers here are
// value objects (OrderForPricing/QuoteForPricing), never a mapper row, a
// repository, or an HTTP client.
//
// BUY fills at the ask when the limit is at or above it (the buyer is
// willing to pay at least what the market is asking). SELL fills at the bid
// when the limit is at or below it (the seller is willing to accept at most
// what the market is bidding). Anything outside that range is not
// marketable right now and is rejected, never partially filled - the order
// status enumeration has no state for a partial fill.
public final class FillRule {

    private FillRule() {
    }

    public static FillDecision decide(OrderForPricing order, QuoteForPricing quote) {
        if (order.side() == OrderSide.BUY) {
            return order.limitPrice().compareTo(quote.ask()) >= 0
                    ? new FillDecision.Fill(quote.ask())
                    : new FillDecision.Reject(RejectionReason.NOT_MARKETABLE);
        }
        return order.limitPrice().compareTo(quote.bid()) <= 0
                ? new FillDecision.Fill(quote.bid())
                : new FillDecision.Reject(RejectionReason.NOT_MARKETABLE);
    }
}
