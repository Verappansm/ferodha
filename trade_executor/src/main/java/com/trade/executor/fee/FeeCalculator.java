package com.trade.executor.fee;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

// A flat commission on the account-currency trade value: fee = tradeValue x
// rate. Charged on both BUY (added to the debit) and SELL (subtracted from
// the credit) - see OrderExecutionService for where each side applies it.
@Component
public class FeeCalculator {

    private final BigDecimal feeRate;

    public FeeCalculator(@Value("${executor.fee.rate:0.001}") BigDecimal feeRate) {
        this.feeRate = feeRate;
    }

    public BigDecimal calculateFee(BigDecimal tradeValueInAccountCurrency) {
        return tradeValueInAccountCurrency.multiply(feeRate);
    }
}
