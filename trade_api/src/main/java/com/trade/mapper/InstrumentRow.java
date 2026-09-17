package com.trade.mapper;

import java.util.UUID;

public record InstrumentRow(
        UUID instrumentId,
        String symbol,
        String displayName,
        String assetClass,
        String quoteCurrency,
        Boolean tradable
) {
}
