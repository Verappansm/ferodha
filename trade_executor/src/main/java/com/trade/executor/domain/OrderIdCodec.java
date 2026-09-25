package com.trade.executor.domain;

import java.util.UUID;

// trade_api's OrderResponseDto/event payloads carry the order id as
// "ORD-<uuid>" (see OrderService.placeOrder); this is the one place that
// prefix is parsed back to the UUID Orders.order_id actually is.
public final class OrderIdCodec {

    private static final String PREFIX = "ORD-";

    private OrderIdCodec() {
    }

    public static UUID parse(String orderId) {
        if (orderId == null || !orderId.startsWith(PREFIX)) {
            throw new IllegalArgumentException("Not a recognized order id: " + orderId);
        }
        return UUID.fromString(orderId.substring(PREFIX.length()));
    }

    public static String format(UUID orderId) {
        return PREFIX + orderId;
    }
}
