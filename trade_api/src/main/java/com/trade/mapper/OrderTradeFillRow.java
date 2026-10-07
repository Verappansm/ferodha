package com.trade.mapper;

import java.math.BigDecimal;
import java.util.UUID;

public record OrderTradeFillRow(UUID orderId, BigDecimal executionPrice, BigDecimal executionQuantity) {
}
