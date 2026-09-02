package com.trade.exception;

import java.math.BigDecimal;

// Rule 6: a BUY costs more (quantity * price) than the account's cash balance.
public class InsufficientFundsException extends DomainException {

    private final BigDecimal required;
    private final BigDecimal available;

    public InsufficientFundsException(BigDecimal required, BigDecimal available) {
        super("ORD-400", "Insufficient funds");
        this.required = required;
        this.available = available;
    }

    public BigDecimal getRequired() {
        return required;
    }

    public BigDecimal getAvailable() {
        return available;
    }
}
