package com.trade.executor.currency;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.MathContext;

// A hardcoded, fixed-rate FX table - not a general currency service. Used
// solely to convert the executed trade value into the account's own
// currency for the purpose of the cash debit/credit (and the fee, which is
// computed on that converted value - see fee.FeeCalculator's caller).
//
// executed_price stored on the Order stays in the instrument's own quote
// currency - this converter is never applied there - and
// PositionMapper.xml's average-cost aggregate is untouched, since it
// already implicitly assumes a single currency. Only USD<->INR is
// supported for now, at a fixed 90 INR = 1 USD, per the confirmed scope.
@Component
public class CurrencyConverter {

    private static final String USD = "USD";
    private static final String INR = "INR";
    private static final BigDecimal USD_TO_INR = new BigDecimal("90");

    public BigDecimal convert(BigDecimal amount, String fromCurrency, String toCurrency) {
        if (fromCurrency.equals(toCurrency)) {
            return amount;
        }
        if (USD.equals(fromCurrency) && INR.equals(toCurrency)) {
            return amount.multiply(USD_TO_INR);
        }
        if (INR.equals(fromCurrency) && USD.equals(toCurrency)) {
            return amount.divide(USD_TO_INR, MathContext.DECIMAL64);
        }
        throw new UnsupportedCurrencyPairException(fromCurrency, toCurrency);
    }
}
