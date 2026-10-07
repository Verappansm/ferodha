package com.trade.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * The PIN is a bcrypt client proof made in the browser. The raw PIN is never sent
 * or logged by this service. The transaction key makes a browser retry safe.
 */
public record BankTransferRequestDto(
        @NotNull @DecimalMin(value = "0.01") @Digits(integer = 14, fraction = 4) BigDecimal amount,
        @NotBlank @Size(min = 60, max = 60) String pinHash,
        @NotNull UUID idempotencyKey
) {
}
