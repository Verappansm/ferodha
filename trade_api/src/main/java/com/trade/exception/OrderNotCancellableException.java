package com.trade.exception;

import com.trade.enums.OrderStatus;

// Sprint 6 addition: the order exists but is already FILLED, REJECTED or
// CANCELLED. Same catalogue code as OrderNotFoundException (ORD-409) but a
// different HTTP status (409, not 404) and a different message, which is how
// a client tells the two apart on this endpoint.
public class OrderNotCancellableException extends DomainException {

    private final String orderId;
    private final OrderStatus currentStatus;

    public OrderNotCancellableException(String orderId, OrderStatus currentStatus) {
        super("ORD-409", "Order is not cancellable");
        this.orderId = orderId;
        this.currentStatus = currentStatus;
    }

    public String getOrderId() {
        return orderId;
    }

    public OrderStatus getCurrentStatus() {
        return currentStatus;
    }
}
