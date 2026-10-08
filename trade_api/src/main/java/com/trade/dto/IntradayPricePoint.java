package com.trade.dto;

import java.time.OffsetDateTime;

public record IntradayPricePoint(
        OffsetDateTime timestamp,
        double price
) {
}