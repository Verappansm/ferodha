package com.trade.executor.marketdata;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

// Story 8's own worked example, recorded here since this repo has no
// separate committed design-decisions doc for it (the same gap Story 1's
// own audit found for the Kafka partition/key justification - there is no
// contracts/ or docs/contracts/ directory anywhere in this repo to put it in
// instead, so it lives here, next to the code it governs, where nobody can
// miss it while touching this class):
//
//   Eight symbols fetched one at a time (8 HTTP requests) every 30 seconds
//   = 8 * (86400 / 30) = 23040 requests/day - the 2000/day key is spent
//   inside about two hours.
//   The same eight symbols batched into one HTTP call (up to 25 symbols
//   per request, so 8 fits in a single batch) every 30 seconds
//   = 1 * (86400 / 30) = 2880 requests/day - still over the 2000/day quota,
//   which is exactly why batching alone isn't enough and the interval
//   itself has to be floored too: 2000/day allows at most one batch every
//   ceil(86400 / 2000) = 44 seconds.
//
// effectiveIntervalSeconds() is that floor, enforced in code rather than
// documented and hoped for: given how many symbols are actually being
// polled right now (which can grow as more accounts hold or watch more
// instruments), it computes the minimum interval that keeps the batched
// request count inside the daily quota, and never returns less than the
// operator's own configured interval either.
@Component
public class PollScheduleCalculator {

    private final int dailyQuota;
    private final int batchSize;

    public PollScheduleCalculator(@Value("${executor.market-data.daily-quota:2000}") int dailyQuota,
                                   @Value("${executor.market-data.batch-size:25}") int batchSize) {
        this.dailyQuota = dailyQuota;
        this.batchSize = batchSize;
    }

    public int effectiveIntervalSeconds(int configuredIntervalSeconds, int symbolCount) {
        if (symbolCount <= 0) {
            return configuredIntervalSeconds;
        }
        int batches = (int) Math.ceil(symbolCount / (double) batchSize);
        int minIntervalForQuota = (int) Math.ceil((86_400.0 * batches) / dailyQuota);
        return Math.max(configuredIntervalSeconds, minIntervalForQuota);
    }
}
