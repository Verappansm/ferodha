package com.trade.executor.mapper;

import java.math.BigDecimal;
import java.util.UUID;

public record AccountRow(
        Long id,
        UUID accountUuid,
        BigDecimal cashBalance,
        String status,
        Integer version,
        String currency
) {
}
