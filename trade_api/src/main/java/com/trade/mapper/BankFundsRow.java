package com.trade.mapper;

import java.math.BigDecimal;
import java.util.UUID;

/** A locked trading-account / linked-bank pair. Never returned directly to the web layer. */
public record BankFundsRow(
        Long accountId,
        UUID accountUuid,
        String bankAccountNumber,
        String pinHash,
        BigDecimal tradingBalance,
        BigDecimal bankBalance,
        String currency,
        String status,
        Integer version
) {
}
