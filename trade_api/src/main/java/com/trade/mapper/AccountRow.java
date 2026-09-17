package com.trade.mapper;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

// The raw shape of one Accounts row, as MyBatis reads it. This is a
// persistence-layer type, not a domain or a DTO type: it carries the
// internal UUID primary key (needed to write Orders.account_id) and the
// owning user's id (needed to write Orders.user_id) alongside the fields the
// domain and the API care about. AccountRepositoryImpl narrows this down to
// the com.trade.domain.Account the business rules actually operate on.
public record AccountRow(
        Long id,
        UUID accountUuid,
        String businessRef,
        UUID userId,
        String holderName,
        BigDecimal cashBalance,
        String status,
        Integer version,
        OffsetDateTime lastUpdated,
        String currency
) {
}
