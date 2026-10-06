package com.trade.dto;

import java.math.BigDecimal;

// The commission trade_executor charges on a fill: fee = trade value x rate,
// on both BUY and SELL. The order ticket reads it to show an estimate.
public record FeeScheduleDto(
        BigDecimal rate
) {
}
