package com.trade.exception;

public class WatchlistNotFoundException extends DomainException {

    public WatchlistNotFoundException(String watchlistId) {
        super("WL-404", "Watchlist not found: " + watchlistId);
    }
}