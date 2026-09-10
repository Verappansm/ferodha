package com.trade.exception;

// Rule 7: a SELL is for more units than the account currently holds.
public class InsufficientHoldingsException extends DomainException {

    private final int requested;
    private final long held;

    public InsufficientHoldingsException(int requested, long held) {
        super("ORD-409", "Insufficient holdings");
        this.requested = requested;
        this.held = held;
    }

    public int getRequested() {
        return requested;
    }

    public long getHeld() {
        return held;
    }
}
