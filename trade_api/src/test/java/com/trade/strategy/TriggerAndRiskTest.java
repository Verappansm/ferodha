package com.trade.strategy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TriggerAndRiskTest {

    private static BigDecimal d(String v) {
        return new BigDecimal(v);
    }

    private static Strategy strategy(String side, String maxSpend, Integer maxPosition) {
        return new Strategy("s1", "u1", 1L, "rule", "AAPL", side, d("100.00"), 50,
                maxSpend == null ? null : d(maxSpend), maxPosition, 1, 3, false, "ENABLED", 0, 0, null, null, null);
    }

    @Test
    @DisplayName("A BUY fires on the tick that falls through the level, not while it stays below")
    void buyFiresOnTheCrossingOnly() {
        assertTrue(TriggerRule.crossed("BUY", d("100"), d("100.50"), d("99.90")));
        assertTrue(TriggerRule.crossed("BUY", d("100"), d("100.50"), d("100.00")));
        assertFalse(TriggerRule.crossed("BUY", d("100"), d("99.90"), d("99.50")));
        assertFalse(TriggerRule.crossed("BUY", d("100"), d("100.50"), d("100.20")));
    }

    @Test
    @DisplayName("A SELL fires on the tick that rises through the level, not while it stays above")
    void sellFiresOnTheCrossingOnly() {
        assertTrue(TriggerRule.crossed("SELL", d("100"), d("99.50"), d("100.10")));
        assertFalse(TriggerRule.crossed("SELL", d("100"), d("100.10"), d("101")));
        assertFalse(TriggerRule.crossed("SELL", d("100"), d("99.00"), d("99.50")));
    }

    @Test
    @DisplayName("A crossing needs a before: with no previous price it is not one")
    void noPreviousPriceNoCrossing() {
        assertFalse(TriggerRule.crossed("BUY", d("100"), null, d("50")));
        assertFalse(TriggerRule.crossed("SELL", d("100"), null, d("500")));
    }

    @Test
    @DisplayName("Like a limit order, the first price seen fires when the level is already met")
    void firstPriceFiresWhenAlreadyMet() {
        assertTrue(TriggerRule.shouldFire("BUY", d("100"), null, d("99.90")));
        assertTrue(TriggerRule.shouldFire("BUY", d("100"), null, d("100.00")));
        assertFalse(TriggerRule.shouldFire("BUY", d("100"), null, d("100.10")));
        assertTrue(TriggerRule.shouldFire("SELL", d("100"), null, d("100.10")));
        assertFalse(TriggerRule.shouldFire("SELL", d("100"), null, d("99.90")));
    }

    @Test
    @DisplayName("After the first price only a crossing fires, so a held level never repeats")
    void afterTheFirstPriceOnlyCrossings() {
        assertFalse(TriggerRule.shouldFire("BUY", d("100"), d("99.50"), d("99.00")));
        assertTrue(TriggerRule.shouldFire("BUY", d("100"), d("100.50"), d("99.90")));
        assertFalse(TriggerRule.shouldFire("BUY", d("100"), d("100.50"), null));
    }

    @Test
    @DisplayName("The limit is the quote nudged 0.02% towards the other side, rounded to cents")
    void limitPriceBuffer() {
        assertEquals(d("100.02"), TriggerRule.limitPrice("BUY", d("100.00")));
        assertEquals(d("230.35"), TriggerRule.limitPrice("BUY", d("230.30")));
        assertEquals(d("99.98"), TriggerRule.limitPrice("SELL", d("100.00")));
        assertEquals(d("230.05"), TriggerRule.limitPrice("SELL", d("230.10")));
    }

    @Test
    @DisplayName("A BUY within its caps passes, fee included")
    void buyWithinCaps() {
        // 50 x 100.02 = 5001.00 + 0.1% = 5006.001 against a 6000 cap
        assertTrue(RiskLimits.check(strategy("BUY", "6000.00", 100), BigDecimal.ZERO, 0,
                d("100.02"), d("0.001")).isEmpty());
    }

    @Test
    @DisplayName("A BUY is refused when what it has already committed plus this order exceeds max spend")
    void buyOverMaxSpend() {
        assertTrue(RiskLimits.check(strategy("BUY", "6000.00", 100), d("1000.00"), 0,
                d("100.02"), d("0.001")).orElseThrow().contains("Max spend"));
    }

    @Test
    @DisplayName("The fee counts: an order that fits only without it is refused")
    void feeCountsTowardsMaxSpend() {
        assertTrue(RiskLimits.check(strategy("BUY", "5001.50", 100), BigDecimal.ZERO, 0,
                d("100.02"), d("0.001")).isPresent());
        assertTrue(RiskLimits.check(strategy("BUY", "5001.50", 100), BigDecimal.ZERO, 0,
                d("100.02"), BigDecimal.ZERO).isEmpty());
    }

    @Test
    @DisplayName("A BUY is refused when held plus pending units plus this order exceed max position")
    void buyOverMaxPosition() {
        assertTrue(RiskLimits.check(strategy("BUY", "100000.00", 100), BigDecimal.ZERO, 60,
                d("100.02"), d("0.001")).orElseThrow().contains("Max position"));
        assertTrue(RiskLimits.check(strategy("BUY", "100000.00", 100), BigDecimal.ZERO, 50,
                d("100.02"), d("0.001")).isEmpty());
    }

    @Test
    @DisplayName("A SELL needs the units free of pending sells")
    void sellNeedsFreeUnits() {
        assertTrue(RiskLimits.check(strategy("SELL", null, null), BigDecimal.ZERO, 50,
                d("99.98"), d("0.001")).isEmpty());
        assertTrue(RiskLimits.check(strategy("SELL", null, null), BigDecimal.ZERO, 49,
                d("99.98"), d("0.001")).orElseThrow().contains("Not enough units"));
    }
}
