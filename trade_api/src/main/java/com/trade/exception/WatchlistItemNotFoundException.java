package com.trade.exception;

public class WatchlistItemNotFoundException extends DomainException {

    public WatchlistItemNotFoundException(String itemId) {
        super("WL-404", "Watchlist item not found: " + itemId);
    }
}