package com.trade.executor.fee;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;

// A flat commission on the account-currency trade value: fee = tradeValue x
// rate. Charged on both BUY (added to the debit) and SELL (subtracted from
// the credit) - see OrderExecutionService for where each side applies it.
// The rate is the order's own (Orders.fee_rate, written by trade_api when it
// accepted the order, LEAP-017); the executor holds no rate of its own.
@Component
public class FeeCalculator {

    public BigDecimal calculateFee(BigDecimal tradeValueInAccountCurrency, BigDecimal feeRate) {
        return tradeValueInAccountCurrency.multiply(feeRate);
    }
}
