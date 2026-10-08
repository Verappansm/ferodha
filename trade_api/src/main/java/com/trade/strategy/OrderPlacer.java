package com.trade.strategy;

import com.trade.dto.PlaceOrderRequestDto;

// How a strategy places an order: through POST /api/v1/orders, so the route's
// validation, authorisation and idempotency check stand between a strategy bug
// and the order book. Never the order service directly, never the orders topic.
public interface OrderPlacer {

    // Returns the new order id, or throws OrderPlacementException.
    String place(String delegatedToken, PlaceOrderRequestDto order);

    class OrderPlacementException extends RuntimeException {
        public OrderPlacementException(String message) {
            super(message);
        }
    }
}
