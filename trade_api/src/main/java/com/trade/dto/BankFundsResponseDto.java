package com.trade.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** The two balances that belong to the authenticated customer's linked bank account. */
public record BankFundsResponseDto(
        long accountId,
        String bankAccountNumber,
        BigDecimal tradingBalance,
        BigDecimal bankBalance,
        String currency,
        OffsetDateTime asOf
) {
}
