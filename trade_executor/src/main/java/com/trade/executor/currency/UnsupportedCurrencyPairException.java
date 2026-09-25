package com.trade.executor.currency;

public class UnsupportedCurrencyPairException extends RuntimeException {

    public UnsupportedCurrencyPairException(String from, String to) {
        super("No fixed conversion rate configured for " + from + " -> " + to);
    }
}
