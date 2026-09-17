package com.trade.dto;

import com.trade.enums.AccountStatus;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// accounts.id and accountId difference is recorded 

public record AccountResponseDto(
        Long id,
        String accountId,
        String holderName,
        BigDecimal cashBalance,
        AccountStatus status,
        Integer version,
        OffsetDateTime lastUpdated
) {
}
