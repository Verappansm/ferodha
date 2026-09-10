package com.trade.dto;

import com.trade.enums.OrderSide;
import com.trade.enums.OrderStatus;

import java.math.BigDecimal;

//for post and delete orders
public record OrderResponseDto(
        String orderId,
        OrderStatus status,
        String message,
        String symbol,
        OrderSide side,
        Integer quantity,
        BigDecimal price
) {
}
