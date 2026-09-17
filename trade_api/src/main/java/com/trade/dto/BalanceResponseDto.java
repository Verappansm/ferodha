package com.trade.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

//account and balance 
public record BalanceResponseDto(
        Long accountId,
        BigDecimal cashBalance,
        String currency,
        OffsetDateTime asOf
) {
}
