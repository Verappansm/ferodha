package com.trade.dto;

import java.util.List;

/** A page of the account's cash movements, newest first. */
public record BankTransactionsResponseDto(
        List<BankTransactionDto> transactions,
        long total,
        int limit,
        int offset
) {
}
