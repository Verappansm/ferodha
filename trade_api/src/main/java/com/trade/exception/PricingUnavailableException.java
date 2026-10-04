package com.trade.exception;

/**
 * Exception raised when market pricing data is unavailable (e.g., Fauxnance API down).
 * HTTP 503 Service Unavailable.
 * Note: Current implementation reads prices from database Positions_View, so this
 * is kept for historical/future API integration purposes.
 */
public class PricingUnavailableException extends DomainException {

    public PricingUnavailableException() {
        super("PRICING-503", "Market pricing temporarily unavailable");
    }

    public PricingUnavailableException(String message) {
        super("PRICING-503", message);
    }
}
