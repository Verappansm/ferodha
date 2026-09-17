package com.trade.executor.pricing;

import com.trade.executor.domain.RejectionReason;
import com.trade.executor.enums.OrderSide;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

// Pure function, no mocks - touches no database and no socket, exactly as
// the story requires. These three tests are the exact "Unit Test Execution
// Paths" wording from storeis.txt's Story 1.
class FillRuleTest {

    @Test
    void aBuyLimitAtOrAboveTheQuoteFillsAtTheQuote() {
        OrderForPricing order = new OrderForPricing(OrderSide.BUY, new BigDecimal("100.50"));
        QuoteForPricing quote = new QuoteForPricing(new BigDecimal("99.00"), new BigDecimal("100.50"));

        FillDecision decision = FillRule.decide(order, quote);

        FillDecision.Fill fill = assertInstanceOf(FillDecision.Fill.class, decision);
        assertEquals(0, new BigDecimal("100.50").compareTo(fill.settlementPrice()));
    }

    @Test
    void aBuyLimitAboveTheAskAlsoFillsAtTheAsk() {
        OrderForPricing order = new OrderForPricing(OrderSide.BUY, new BigDecimal("110.00"));
        QuoteForPricing quote = new QuoteForPricing(new BigDecimal("99.00"), new BigDecimal("100.50"));

        FillDecision decision = FillRule.decide(order, quote);

        FillDecision.Fill fill = assertInstanceOf(FillDecision.Fill.class, decision);
        assertEquals(0, new BigDecimal("100.50").compareTo(fill.settlementPrice()));
    }

    @Test
    void aSellLimitAtOrBelowTheQuoteFillsAtTheQuote() {
        OrderForPricing order = new OrderForPricing(OrderSide.SELL, new BigDecimal("99.00"));
        QuoteForPricing quote = new QuoteForPricing(new BigDecimal("99.00"), new BigDecimal("100.50"));

        FillDecision decision = FillRule.decide(order, quote);

        FillDecision.Fill fill = assertInstanceOf(FillDecision.Fill.class, decision);
        assertEquals(0, new BigDecimal("99.00").compareTo(fill.settlementPrice()));
    }

    @Test
    void aBuyOrderOutsideTheMarketableRangeIsRejected() {
        OrderForPricing order = new OrderForPricing(OrderSide.BUY, new BigDecimal("90.00"));
        QuoteForPricing quote = new QuoteForPricing(new BigDecimal("99.00"), new BigDecimal("100.50"));

        FillDecision decision = FillRule.decide(order, quote);

        FillDecision.Reject reject = assertInstanceOf(FillDecision.Reject.class, decision);
        assertEquals(RejectionReason.NOT_MARKETABLE, reject.reason());
    }

    @Test
    void aSellOrderOutsideTheMarketableRangeIsRejected() {
        OrderForPricing order = new OrderForPricing(OrderSide.SELL, new BigDecimal("150.00"));
        QuoteForPricing quote = new QuoteForPricing(new BigDecimal("99.00"), new BigDecimal("100.50"));

        FillDecision decision = FillRule.decide(order, quote);

        FillDecision.Reject reject = assertInstanceOf(FillDecision.Reject.class, decision);
        assertEquals(RejectionReason.NOT_MARKETABLE, reject.reason());
    }
}
