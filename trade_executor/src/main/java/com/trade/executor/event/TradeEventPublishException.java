package com.trade.executor.event;

// Unchecked - must propagate out of OrderExecutionService into the Kafka
// listener so the ORDER_PLACED offset is never acknowledged for an event
// that failed to publish (see the known dual-write trade-off noted on
// OrderExecutionService).
public class TradeEventPublishException extends RuntimeException {

    public TradeEventPublishException(String eventType, Long accountId, Throwable cause) {
        super("Failed to publish " + eventType + " for account " + accountId, cause);
    }
}
