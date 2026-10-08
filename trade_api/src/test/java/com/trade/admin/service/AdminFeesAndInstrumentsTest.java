package com.trade.admin.service;

import com.trade.admin.AdminException;
import com.trade.admin.dto.AdminDtos.AdminInstrumentDto;
import com.trade.admin.dto.AdminDtos.CreateInstrumentRequest;
import com.trade.admin.dto.AdminDtos.FeeInstrumentDto;
import com.trade.admin.dto.AdminDtos.FeeSummaryDto;
import com.trade.admin.dto.AdminDtos.FeeUserDto;
import com.trade.admin.dto.AdminDtos.PageDto;
import com.trade.admin.mapper.AdminMapper;
import com.trade.admin.mapper.FeeCurrencyRow;
import com.trade.admin.mapper.FeeInstrumentRow;
import com.trade.admin.mapper.FeeUserRow;
import com.trade.security.AdminPrincipal;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// The fee figures an admin reads and the rules for adding an instrument,
// against a mocked mapper (the SQL runs only against a real Postgres).
class AdminFeesAndInstrumentsTest {

    private static final AdminPrincipal ADMIN =
            new AdminPrincipal(UUID.fromString("55555555-5555-5555-5555-555555555555"), List.of("ADMIN"));

    private final AdminMapper mapper = mock(AdminMapper.class);
    private final AdminAuditLog audit = mock(AdminAuditLog.class);
    private final AdminFeeService fees = new AdminFeeService(mapper,
            Clock.fixed(Instant.parse("2026-10-17T10:00:00Z"), ZoneOffset.UTC));
    private final AdminInstrumentService instruments = new AdminInstrumentService(mapper, audit);

    private static BigDecimal d(String v) {
        return new BigDecimal(v);
    }

    @Test
    @DisplayName("The summary adds every currency up in USD, converting INR at 90 to the dollar")
    void summaryConvertsToUsd() {
        when(mapper.feeTotalsByCurrency(null, null)).thenReturn(List.of(
                new FeeCurrencyRow("INR", 4L, d("900.00")),
                new FeeCurrencyRow("USD", 6L, d("12.50"))));
        when(mapper.feeTotalsByCurrency(LocalDate.of(2026, 10, 1), null)).thenReturn(List.of(
                new FeeCurrencyRow("USD", 2L, d("3.00"))));

        FeeSummaryDto summary = fees.summary();

        assertEquals("USD", summary.currency());
        assertEquals(d("22.50"), summary.totalFees()); // 900 / 90 + 12.50
        assertEquals(d("3.00"), summary.feesThisMonth());
        assertEquals(10L, summary.feeOrders());
        assertEquals(2, summary.byCurrency().size());
        assertEquals(false, summary.partial());
    }

    @Test
    @DisplayName("A currency that cannot be converted is left out of the USD total and flagged")
    void unknownCurrencyIsFlagged() {
        when(mapper.feeTotalsByCurrency(null, null)).thenReturn(List.of(
                new FeeCurrencyRow("EUR", 1L, d("5.00")), new FeeCurrencyRow("USD", 1L, d("1.00"))));
        when(mapper.feeTotalsByCurrency(LocalDate.of(2026, 10, 1), null)).thenReturn(List.of());

        FeeSummaryDto summary = fees.summary();

        assertEquals(d("1.00"), summary.totalFees());
        assertTrue(summary.partial());
    }

    @Test
    @DisplayName("An empty platform reports zero, not null")
    void noFeesYet() {
        when(mapper.feeTotalsByCurrency(any(), any())).thenReturn(List.of());
        FeeSummaryDto summary = fees.summary();
        assertEquals(d("0.00"), summary.totalFees());
        assertEquals(0L, summary.feeOrders());
    }

    @Test
    @DisplayName("By user: each account in its own currency and in USD")
    void byUser() {
        when(mapper.feesByUser(any(), any(), any(), any(), anyInt(), anyInt())).thenReturn(List.of(
                new FeeUserRow("u1", "Priya", "priya@example.com", 2L, "INR", 3L, d("450.00")),
                new FeeUserRow("u2", "John", "john@example.com", 1L, "USD", 2L, d("4.00"))));
        when(mapper.countFeeUsers(any(), any(), any())).thenReturn(2L);

        PageDto<FeeUserDto> page = fees.byUser(null, null, " ", new Paging(0, 25));

        assertEquals(2L, page.totalItems());
        assertEquals(d("5.00"), page.items().get(0).feesUsd());
        assertEquals(d("450.00"), page.items().get(0).fees());
        assertEquals(d("4.00"), page.items().get(1).feesUsd());
        verify(mapper).feesByUser(null, null, null, new BigDecimal("90"), 0, 25);
    }

    @Test
    @DisplayName("By instrument: the same symbol in two currencies is one row, largest first")
    void byInstrument() {
        when(mapper.feesByInstrument(null, null)).thenReturn(List.of(
                new FeeInstrumentRow("AAPL", "Apple", "USD", 2L, d("3.00")),
                new FeeInstrumentRow("AAPL", "Apple", "INR", 1L, d("180.00")),
                new FeeInstrumentRow("MSFT", "Microsoft", "USD", 1L, d("4.00"))));

        List<FeeInstrumentDto> rows = fees.byInstrument(null, null);

        assertEquals(List.of("AAPL", "MSFT"), rows.stream().map(FeeInstrumentDto::symbol).toList());
        assertEquals(d("5.00"), rows.get(0).feesUsd()); // 3.00 + 180 / 90
        assertEquals(3L, rows.get(0).orders());
    }

    @Test
    @DisplayName("A range that ends before it starts is refused")
    void backwardsRange() {
        assertThrows(AdminException.class,
                () -> fees.byInstrument(LocalDate.of(2026, 10, 10), LocalDate.of(2026, 10, 1)));
        assertThrows(AdminException.class,
                () -> fees.byUser(LocalDate.of(2026, 10, 10), LocalDate.of(2026, 10, 1), null, new Paging(0, 25)));
    }

    private static CreateInstrumentRequest request(String type) {
        return new CreateInstrumentRequest("NEWCO", "NewCo Inc.", "NASDAQ", "USD", type, "Technology",
                "Listing requested");
    }

    private static AdminInstrumentDto created() {
        return new AdminInstrumentDto("00000000-0000-4000-8000-000000000001", "NEWCO", "NewCo Inc.", "NASDAQ",
                "USD", "EQUITY", "Technology", true, "Michael Brown", null);
    }

    @Test
    @DisplayName("Adding an instrument lists it as tradable and records who added it and why")
    void addsAnInstrument() {
        when(mapper.insertInstrument(anyString(), anyString(), anyString(), anyString(), anyString(), any(),
                anyString())).thenReturn("00000000-0000-4000-8000-000000000001");
        when(mapper.findInstrument("00000000-0000-4000-8000-000000000001")).thenReturn(created());

        AdminInstrumentDto result = instruments.create(request("EQUITY"), ADMIN);

        assertEquals("NEWCO", result.symbol());
        verify(mapper).insertInstrument("NEWCO", "NewCo Inc.", "NASDAQ", "USD", "EQUITY", "Technology",
                ADMIN.userId().toString());
        verify(audit).record(ADMIN, "INSTRUMENT_ADDED", "INSTRUMENT", "NEWCO", "Listing requested");
    }

    @Test
    @DisplayName("A ticker that already exists is a conflict and records nothing")
    void duplicateTickerIsAConflict() {
        when(mapper.insertInstrument(anyString(), anyString(), anyString(), anyString(), anyString(), any(),
                anyString())).thenReturn(null);

        AdminException e = assertThrows(AdminException.class, () -> instruments.create(request("EQUITY"), ADMIN));

        assertEquals("ADM-409", e.getCode());
        verify(audit, never()).record(any(), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("An unknown instrument type is refused before anything is written")
    void unknownTypeIsRefused() {
        assertThrows(AdminException.class, () -> instruments.create(request("WARRANT"), ADMIN));
        verify(mapper, never()).insertInstrument(anyString(), anyString(), anyString(), anyString(), anyString(),
                any(), eq(ADMIN.userId().toString()));
    }
}
