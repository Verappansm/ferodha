package com.trade.exception;

// Also the answer for a strategy that belongs to another account: a caller
// cannot tell "not yours" from "does not exist".
public class StrategyNotFoundException extends DomainException {

    public StrategyNotFoundException(String strategyId) {
        super("STR-404", "Strategy not found");
    }
}
