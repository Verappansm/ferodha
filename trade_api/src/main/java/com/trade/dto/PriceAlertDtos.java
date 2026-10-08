package com.trade.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

public class PriceAlertDtos {

    private PriceAlertDtos() {
    }

    /** A threshold is a positive price with at most two decimals (LEAP-007). */
    public static boolean isValidThreshold(BigDecimal price) {
        return price != null && price.signum() > 0 && price.stripTrailingZeros().scale() <= 2;
    }

    static boolean isDirection(String direction) {
        return "ABOVE".equals(direction) || "BELOW".equals(direction);
    }

    public record CreatePriceAlertRequest(
            UUID itemId,
            BigDecimal alertPrice,
            String alertDirection
    ) {
        public boolean isValid() {
            return itemId != null && isValidThreshold(alertPrice) && isDirection(alertDirection);
        }
    }

    /** Both set re-arms the alert at the new threshold; both null cancels it. */
    public record UpdatePriceAlertRequest(
            BigDecimal alertPrice,
            String alertDirection
    ) {
        public boolean isCancel() {
            return alertPrice == null && alertDirection == null;
        }

        public boolean isValid() {
            return isCancel() || (isValidThreshold(alertPrice) && isDirection(alertDirection));
        }
    }

    public record PriceAlertResponse(
            UUID itemId,
            String symbol,
            String name,
            BigDecimal alertPrice,
            String alertDirection,
            /** ACTIVE, TRIGGERED or CANCELLED. */
            String alertStatus,
            OffsetDateTime alertTriggeredAt,
            BigDecimal alertTriggeredPrice
    ) {
    }
}
