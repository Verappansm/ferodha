package com.trade.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;


public class Position {

    private final Long accountId;
    private final String symbol;
    private long quantity;
    private BigDecimal averageCost;

    public Position(Long accountId, String symbol, long quantity, BigDecimal averageCost) {
        this.accountId = accountId;
        this.symbol = symbol;
        this.quantity = quantity;
        this.averageCost = averageCost;
    }

    public Position(Long accountId, String symbol) {
        this(accountId, symbol, 0L, BigDecimal.ZERO);
    }

    public void applyBuy(long buyQuantity, BigDecimal buyPrice) {
        BigDecimal oldCost = averageCost.multiply(BigDecimal.valueOf(quantity));
        BigDecimal newCost = buyPrice.multiply(BigDecimal.valueOf(buyQuantity));
        long newQuantity = quantity + buyQuantity;

        averageCost = oldCost.add(newCost)
                .divide(BigDecimal.valueOf(newQuantity), 2, RoundingMode.HALF_UP);
        quantity = newQuantity;
    }

    public void applySell(long sellQuantity) {
        if (sellQuantity > quantity) {
            throw new IllegalStateException("Cannot sell more units than are held");
        }
        quantity -= sellQuantity;
    }

    public Long getAccountId() {
        return accountId;
    }

    public String getSymbol() {
        return symbol;
    }

    public long getQuantity() {
        return quantity;
    }

    public BigDecimal getAverageCost() {
        return averageCost;
    }
}
