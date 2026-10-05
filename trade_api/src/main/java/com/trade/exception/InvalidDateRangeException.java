package com.trade.exception;

import java.time.LocalDate;

// GET /portfolio/{accountId}/pnl with `from` later than `to`. Same VAL-422
// body as any other field validation failure.
public class InvalidDateRangeException extends DomainException {

    private final LocalDate from;
    private final LocalDate to;

    public InvalidDateRangeException(LocalDate from, LocalDate to) {
        super("VAL-422", "Invalid input");
        this.from = from;
        this.to = to;
    }

    public LocalDate getFrom() {
        return from;
    }

    public LocalDate getTo() {
        return to;
    }
}
