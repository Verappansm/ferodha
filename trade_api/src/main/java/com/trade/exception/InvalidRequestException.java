package com.trade.exception;

// A request body with invalid content (missing required fields, invalid values).
// The usual VAL-422 body.
public class InvalidRequestException extends DomainException {

    public InvalidRequestException(String message) {
        super("VAL-422", message);
    }
}