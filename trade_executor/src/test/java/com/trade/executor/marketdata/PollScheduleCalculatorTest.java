package com.trade.executor.marketdata;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

// Story 8's own "Unit Test Execution Paths": the configured interval stays
// inside the daily quota for the declared symbol set, and the interval
// floor is enforced in code.
class PollScheduleCalculatorTest {

    private final PollScheduleCalculator calculator = new PollScheduleCalculator(2000, 25);

    @Test
    @DisplayName("a configured interval that already stays inside the quota is left alone")
    void staysAtConfiguredIntervalWhenWellWithinQuota() {
        // 8 symbols, 1 batch, every 300s = 288 requests/day - inside 2000.
        assertEquals(300, calculator.effectiveIntervalSeconds(300, 8));
    }

    @Test
    @DisplayName("the story's own worked example: 8 symbols every 30s must be floored to stay inside the daily quota")
    void raisesTheIntervalWhenTheConfiguredValueWouldExceedTheQuota() {
        // 8 symbols fit in 1 batch; every 30s that's 86400/30 = 2880
        // requests/day, still over the 2000/day quota even though batched.
        // ceil(86400 / 2000) = 44s is the true floor for 1 batch.
        int effective = calculator.effectiveIntervalSeconds(30, 8);
        assertTrue(effective > 30, "the floor must raise an under-quota interval");
        assertEquals(44, effective);
    }

    @Test
    @DisplayName("more than one batch's worth of symbols raises the floor further")
    void accountsForMultipleBatches() {
        // 30 symbols -> 2 batches; ceil(86400 * 2 / 2000) = 87s.
        assertEquals(87, calculator.effectiveIntervalSeconds(30, 30));
    }

    @Test
    @DisplayName("no pollable symbols leaves the configured interval untouched")
    void noSymbolsLeavesConfiguredIntervalAlone() {
        assertEquals(60, calculator.effectiveIntervalSeconds(60, 0));
    }
}
