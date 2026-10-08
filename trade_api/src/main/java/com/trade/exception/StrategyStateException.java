package com.trade.exception;

// The strategy is in a state the action does not apply to (enabling one that
// has completed or expired, for example).
public class StrategyStateException extends DomainException {

    public StrategyStateException(String message) {
        super("STR-409", message);
    }
}
