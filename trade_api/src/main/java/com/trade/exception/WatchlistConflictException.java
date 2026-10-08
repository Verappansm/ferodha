package com.trade.exception;

public class WatchlistConflictException extends DomainException {

    public WatchlistConflictException(String message) {
        super("WL-409", message);
    }
}