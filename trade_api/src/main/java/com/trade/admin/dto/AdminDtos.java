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
