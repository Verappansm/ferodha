package com.trade.dto;

import java.math.BigDecimal;
import java.util.UUID;

public class PriceAlertDtos {

    public record CreatePriceAlertRequest(
            UUID itemId,
            BigDecimal alertPrice,
            String alertDirection
    ) {
        public boolean isValid() {
            return itemId != null
                    && alertPrice != null
                    && alertPrice.signum() >= 0
                    && alertDirection != null
                    && (alertDirection.equals("ABOVE") || alertDirection.equals("BELOW"));
        }
    }

    public record UpdatePriceAlertRequest(
            BigDecimal alertPrice,
            String alertDirection
    ) {
        public boolean isValid() {
            if (alertPrice != null && alertPrice.signum() < 0) {
                return false;
            }
            if (alertDirection != null && !alertDirection.equals("ABOVE") && !alertDirection.equals("BELOW")) {
                return false;
            }
            return true;
        }
    }

    public record PriceAlertResponse(
            UUID itemId,
            String symbol,
            String name,
            BigDecimal alertPrice,
            String alertDirection
    ) {
    }

    public record PriceAlertCheckResult(
            UUID itemId,
            UUID userId,
            String symbol,
            String name,
            BigDecimal alertPrice,
            String alertDirection,
            BigDecimal currentPrice,
            boolean triggered
    ) {
    }
}