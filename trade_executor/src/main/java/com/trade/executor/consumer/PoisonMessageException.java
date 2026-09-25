package com.trade.executor.consumer;

// Marks a message that will never succeed no matter how many times it is
// retried: malformed JSON, a missing/unparseable order identifier, an order
// identifier not in Postgres, or an unexpected event type. Registered as a
// non-retryable exception on the container's DefaultErrorHandler
// (see KafkaConsumerConfig), so these dead-letter on the first attempt
// instead of burning the same retry budget a transient failure gets.
public class PoisonMessageException extends RuntimeException {

    public PoisonMessageException(String message) {
        super(message);
    }

    public PoisonMessageException(String message, Throwable cause) {
        super(message, cause);
    }
}
