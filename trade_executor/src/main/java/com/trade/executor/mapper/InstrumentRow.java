package com.trade.executor.mapper;

import java.util.UUID;

public record InstrumentRow(
        UUID instrumentId,
        String symbol,
        String currency,
        Boolean tradable
) {
}
