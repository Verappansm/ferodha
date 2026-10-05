package com.trade.dto;

import com.trade.enums.OrderSide;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;

public record PlaceOrderRequestDto(

        @NotNull
        @Min(1)
        Long accountId,

        @NotBlank
        @Size(max = 20)
        String symbol,

        @NotNull
        OrderSide side,

        @NotNull
        @Min(1)
        Integer quantity,

        @NotNull
        @DecimalMin(
                value = "0.00",
                inclusive = false
        )
        @Digits(
                integer = 18,
                fraction = 2
        )
        BigDecimal price,

        @NotBlank
        @Size(min = 8, max = 100)
        String idempotencyKey
) {
}
