package com.trade.strategy;

import java.time.OffsetDateTime;

// One line of a strategy's activity log: why it fired, was blocked, failed or
// stopped. The customer reads this to see what happened while they were away.
public record StrategyEvent(OffsetDateTime at, String kind, String detail) {
}
