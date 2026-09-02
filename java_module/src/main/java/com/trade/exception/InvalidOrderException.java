package com.trade.exception;

// Rules 4 and 5: quantity or price is out of range (zero, negative, or
// missing). The brief's list of 6 catalogue cases has no entry for this, so
// this is the type we chose to add for it (the brief allows either adding a
// type here, or arguing validation alone covers it - we picked "add a type"
// because OrderLogic has to reject this even when nobody ran the DTO
// validator first, e.g. an order replayed by the Trade Executor in Sprint 7).
public class InvalidOrderException extends DomainException {

    // Which field failed - "quantity" or "price". Only used for the log,
    // never shown to the caller.
    private final String field;

    public InvalidOrderException(String field) {
        super("VAL-422", "Invalid input");
        this.field = field;
    }

    public String getField() {
        return field;
    }
}
