package com.trade.strategy;

import com.trade.enums.OrderSide;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public final class StrategyDtos {

    private StrategyDtos() {
    }

    // A rule as the customer sets it. BUY needs both caps; SELL ignores them
    // (it can only ever sell units already held).
    public record CreateStrategyRequest(
            @NotBlank @Size(max = 60) String name,
            @NotBlank @Size(max = 20) String symbol,
            @NotNull OrderSide side,
            @NotNull @DecimalMin(value = "0.00", inclusive = false) @Digits(integer = 16, fraction = 2)
            BigDecimal triggerPrice,
            @NotNull @Min(1) Integer quantity,
            @DecimalMin(value = "0.00", inclusive = false) @Digits(integer = 16, fraction = 2)
            BigDecimal maxSpend,
            @Min(1) Integer maxPosition,
            @Min(1) @Max(100) Integer maxOrders,
            @Min(1) @Max(20) Integer maxFailures,
            Boolean dryRun,
            OffsetDateTime expiresAt
    ) {
    }

    public record StrategyResponse(
            String strategyId,
            String name,
            String symbol,
            String side,
            BigDecimal triggerPrice,
            Integer quantity,
            BigDecimal maxSpend,
            Integer maxPosition,
            Integer maxOrders,
            Integer maxFailures,
            Boolean dryRun,
            String status,
            Integer ordersPlaced,
            Integer consecutiveFailures,
            OffsetDateTime expiresAt,
            OffsetDateTime createdAt,
            // the price it last watched (the ask for a BUY, the bid for a SELL) and when
            BigDecimal lastPrice,
            OffsetDateTime lastCheckedAt
    ) {
        static StrategyResponse from(Strategy s) {
            return new StrategyResponse(s.strategyId(), s.name(), s.symbol(), s.side(), s.triggerPrice(),
                    s.quantity(), s.maxSpend(), s.maxPosition(), s.maxOrders(), s.maxFailures(), s.dryRun(),
                    s.status(), s.ordersPlaced(), s.consecutiveFailures(), s.expiresAt(), s.createdAt(),
                    s.lastPrice(), s.lastCheckedAt());
        }
    }

    public record StrategyEventResponse(OffsetDateTime at, String kind, String detail) {
        static StrategyEventResponse from(StrategyEvent e) {
            return new StrategyEventResponse(e.at(), e.kind(), e.detail());
        }
    }
}
