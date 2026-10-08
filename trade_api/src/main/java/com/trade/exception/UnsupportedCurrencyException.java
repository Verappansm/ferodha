package com.trade.exception;

// The account's currency has no rate to or from the instrument's currency
// under CurrencyConversion's fixed policy (e.g. a EUR account buying a USD
// instrument). Rejected at placement, so the order never reaches the
// executor without the rate it needs to settle.
public class UnsupportedCurrencyException extends DomainException {

    private final String instrumentCurrency;
    private final String accountCurrency;

    public UnsupportedCurrencyException(String instrumentCurrency, String accountCurrency) {
        super("FX-422", "Currency not supported for trading");
        this.instrumentCurrency = instrumentCurrency;
        this.accountCurrency = accountCurrency;
    }

    public String getInstrumentCurrency() {
        return instrumentCurrency;
    }

    public String getAccountCurrency() {
        return accountCurrency;
    }
}
