package com.trade.domain;

import com.trade.enums.OrderSide;
import com.trade.enums.OrderStatus;

import java.math.BigDecimal;

// Buy or sell instruments
public class Order {

    private Long accountId;
    private String symbol;
    private OrderSide side;
    private Integer quantity;
    private BigDecimal price;
    private String idempotencyKey;

    private OrderStatus status = OrderStatus.NEW;

    private BigDecimal executedPrice;

    public void markFilled(BigDecimal executedPrice) {
        requireStillNew();
        this.status = OrderStatus.FILLED;
        this.executedPrice = executedPrice;
    }

    public void reject() {
        requireStillNew();
        this.status = OrderStatus.REJECTED;
    }

    public void cancel() {
        requireStillNew();
        this.status = OrderStatus.CANCELLED;
    }

    private void requireStillNew() {
        if (status != OrderStatus.NEW) {
            throw new IllegalStateException(
                    "Order already reached a terminal state: " + status);
        }
    }

    public Long getAccountId() {
        return accountId;
    }

    public void setAccountId(Long accountId) {
        this.accountId = accountId;
    }

    public String getSymbol() {
        return symbol;
    }

    public void setSymbol(String symbol) {
        this.symbol = symbol;
    }

    public OrderSide getSide() {
        return side;
    }

    public void setSide(OrderSide side) {
        this.side = side;
    }

    public Integer getQuantity() {
        return quantity;
    }

    public void setQuantity(Integer quantity) {
        this.quantity = quantity;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public void setIdempotencyKey(String idempotencyKey) {
        this.idempotencyKey = idempotencyKey;
    }

    public OrderStatus getStatus() {
        return status;
    }

    public BigDecimal getExecutedPrice() {
        return executedPrice;
    }
}
