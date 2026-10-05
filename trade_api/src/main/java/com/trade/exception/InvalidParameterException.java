package com.trade.exception;

// A query parameter outside what the route accepts (an unknown chart range,
// a page size out of bounds). The usual VAL-422 body.
public class InvalidParameterException extends DomainException {

    private final String parameter;

    public InvalidParameterException(String parameter) {
        super("VAL-422", "Invalid input");
        this.parameter = parameter;
    }

    public String getParameter() {
        return parameter;
    }
}
