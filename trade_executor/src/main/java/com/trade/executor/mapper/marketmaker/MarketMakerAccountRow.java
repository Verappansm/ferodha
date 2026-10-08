package com.trade.executor.mapper.marketmaker;

import java.util.UUID;

// The one seeded Account (see trade_api's 006-market-maker-account.sql)
// every synthetic order is placed through - accountUuid/userId for the
// Orders FK columns, accountId for the Kafka payload's numeric accountId,
// same field OrderPlacedPayload already carries for a portal order.
public record MarketMakerAccountRow(UUID accountUuid, long accountId, UUID userId) {
}
