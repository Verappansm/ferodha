package com.trade.exception;

// Rule 8: this idempotencyKey has already been accepted on an earlier order.
// Same code as InsufficientHoldingsException (ORD-409) - one code can mean
// two different things, the caller is expected to read the message too.
public class DuplicateOrderException extends DomainException {

    private final String idempotencyKey;

    public DuplicateOrderException(String idempotencyKey) {
        super("ORD-409", "Duplicate order");
        this.idempotencyKey = idempotencyKey;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }
}
