package com.trade.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

// The request and response bodies of design/admin-trade-api.yaml, one record
// per schema, field names exactly as the contract spells them.
public final class AdminDtos {

    private AdminDtos() {
    }

    public record ReasonRequest(
            @NotBlank @Size(min = 3, max = 500) String reason) {
    }

    public record ApproveAccountRequest(
            @NotBlank @Size(min = 4, max = 50) String bankAccountNumber,
            @NotBlank @Pattern(regexp = "^[A-Z]{3}$") String currency,
            @Size(max = 500) String note) {
    }

    public record AccountRequestDto(
            String requestId,
            String userId,
            String applicantName,
            String applicantEmail,
            String currency,
            String status,
            OffsetDateTime requestedAt,
            String reason,
            String decidedByName,
            OffsetDateTime decidedAt,
            Long accountId) {
    }

    public record AdminAccountDto(
            long accountId,
            String businessRef,
            String ownerName,
            String ownerEmail,
            String currency,
            BigDecimal cashBalance,
            String status,
            int workingOrders,
            OffsetDateTime createdOn) {
    }

    public record AdminInstrumentDto(
            String instrumentId,
            String symbol,
            String name,
            String exchange,
            String currency,
            String type,
            String sector,
            boolean tradable,
            String changedByName,
            OffsetDateTime changedAt) {
    }

    public record AdminOrderDto(
            String orderId,
            long accountId,
            String ownerEmail,
            String symbol,
            String side,
            long quantity,
            Long filledQuantity,
            BigDecimal price,
            BigDecimal executedPrice,
            String status,
            String source,
            OffsetDateTime createdOn) {
    }

    public record AdminSummaryDto(
            long pendingRequests,
            long activeUsers,
            long suspendedUsers,
            long activeAccounts,
            long ordersToday,
            long ordersWorking,
            long tradableInstruments) {
    }

    // ---- Fees ----

    // Commission the platform has taken, in USD. Orders are charged in the
    // account's own currency; INR is converted at the fixed 90 INR = 1 USD the
    // executor settles at, and byCurrency keeps the unconverted figures.
    // partial is true when a currency could not be converted and is left out
    // of the USD totals.
    public record FeeSummaryDto(
            String currency,
            BigDecimal totalFees,
            BigDecimal feesThisMonth,
            long feeOrders,
            List<FeeByCurrencyDto> byCurrency,
            boolean partial) {
    }

    public record FeeByCurrencyDto(String currency, long orders, BigDecimal fees) {
    }

    // One customer account: fees in its own currency, and in USD for ranking.
    public record FeeUserDto(
            String userId,
            String name,
            String email,
            long accountId,
            String currency,
            long orders,
            BigDecimal fees,
            BigDecimal feesUsd) {
    }

    // One instrument, in USD.
    public record FeeInstrumentDto(String symbol, String name, long orders, BigDecimal feesUsd) {
    }

    public record CreateInstrumentRequest(
            @NotBlank @Pattern(regexp = "^[A-Z0-9][A-Z0-9.\\-]{0,19}$") String ticker,
            @NotBlank @Size(max = 150) String name,
            @NotBlank @Size(max = 50) String exchange,
            @NotBlank @Pattern(regexp = "^[A-Z]{3}$") String currency,
            @NotBlank String type,
            @Size(max = 50) String sector,
            @NotBlank @Size(min = 3, max = 500) String reason) {
    }

    public record ComponentHealthDto(String name, String status, String detail, Long latencyMs) {
    }

    public record SystemHealthDto(OffsetDateTime checkedAt, List<ComponentHealthDto> components) {
    }

    public record AuditEntryDto(
            long id,
            String actorName,
            String action,
            String targetType,
            String targetId,
            String reason,
            OffsetDateTime at) {
    }

    // AccountPage, InstrumentPage, OrderPage and AuditPage in the contract.
    public record PageDto<T>(List<T> items, int page, int size, long totalItems) {
    }
}
