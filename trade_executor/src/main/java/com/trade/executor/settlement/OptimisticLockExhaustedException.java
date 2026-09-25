package com.trade.executor.settlement;

// Unchecked on purpose: it must propagate out of SettlementService's
// @Transactional method (rolling back Guard 1's status write too) and out of
// the Kafka listener into the container's error handler, so an exhausted
// retry budget is reported as an error rather than silently ignored.
public class OptimisticLockExhaustedException extends RuntimeException {

    public OptimisticLockExhaustedException(Long accountId, int attempts) {
        super("Exhausted " + attempts + " optimistic-lock attempts adjusting balance for account " + accountId);
    }
}
