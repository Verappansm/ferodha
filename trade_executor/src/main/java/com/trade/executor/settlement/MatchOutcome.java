package com.trade.executor.settlement;

// One resting-order match attempt's result. CONTENDED means
// matchRestingOrderIfUnchanged affected zero rows - another delivery
// matched this same resting order first; OrderBookMatcher re-reads and
// moves on rather than treating this as a failure.
public record MatchOutcome(Result result) {

    public enum Result {
        MATCHED, CONTENDED
    }

    public static MatchOutcome matched() {
        return new MatchOutcome(Result.MATCHED);
    }

    public static MatchOutcome contended() {
        return new MatchOutcome(Result.CONTENDED);
    }
}
