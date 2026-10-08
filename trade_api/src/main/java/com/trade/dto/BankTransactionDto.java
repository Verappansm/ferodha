package com.trade.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/** One cash movement on the trading account (LEAP-019), in the account currency. */
public record BankTransactionDto(
        UUID transactionId,
        String type,
        BigDecimal amount,
        String currency,
        OffsetDateTime at
) {
}
