package com.trade.exception;

// Sprint 6 addition, not one of the Sprint 5 domain's original six cases:
// DELETE /api/v1/orders/{id} for an id that does not exist. The contract has
// no dedicated "order not found" code in the catalogue, so this is answered
// with the ORD-409 code at HTTP 404 - the status is what tells the two
// ORD-409 cases on this endpoint apart, the code alone does not.
public class OrderNotFoundException extends DomainException {

    private final String orderId;

    public OrderNotFoundException(String orderId) {
        super("ORD-409", "Order not found");
        this.orderId = orderId;
    }

    public String getOrderId() {
        return orderId;
    }
}
