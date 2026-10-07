package com.trade.notification.exception;

public class PreferencesNotFoundException extends Exception {
    public PreferencesNotFoundException(String message) {
        super(message);
    }

    public PreferencesNotFoundException(String message, Throwable cause) {
        super(message, cause);
    }
}
