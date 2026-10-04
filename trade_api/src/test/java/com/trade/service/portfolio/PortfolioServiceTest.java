package com.trade.service.portfolio;

import com.trade.dto.portfolio.PnlResponseDto;
import com.trade.dto.portfolio.PortfolioSummaryDto;
import com.trade.dto.portfolio.PricedPositionDto;
import com.trade.exception.AccountNotActiveException;
import com.trade.exception.AccountNotFoundException;
import com.trade.exception.InvalidDateRangeException;
import com.trade.exception.PricingUnavailableException;
import com.trade.mapper.AccountMapper;
import com.trade.mapper.AccountRow;
import com.trade.mapper.FillRow;
import com.trade.mapper.PortfolioMapper;
import com.trade.mapper.StoredPriceRow;
import com.trade.service.AccountAccessGuard;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class PortfolioServiceTest {

    private static final long ACCOUNT_ID = 1L;
    private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-10-04T12:00:00Z");

    private AccountMapper accountMapper;
    private PortfolioMapper portfolioMapper;
    private LatestQuotes latestQuotes;
    private PortfolioService service;
    private final List<FillRow> fills = new ArrayList<>();

    @BeforeEach
    void setUp() {
        accountMapper = mock(AccountMapper.class);
        portfolioMapper = mock(PortfolioMapper.class);
        latestQuotes = new LatestQuotes();
        service = new PortfolioService(accountMapper, portfolioMapper, new AccountAccessGuard(), latestQuotes,
                Duration.ofMinutes(5), Clock.fixed(NOW.toInstant(), ZoneOffset.UTC));
        when(portfolioMapper.findFills(anyLong())).thenReturn(fills);
        when(portfolioMapper.findLatestStoredPrices(anyCollection())).thenReturn(List.of());
        givenAccount("USD", "1000.00");
    }

    @Test
    @DisplayName("unrealised P&L is (price - average cost) x quantity")
    void unrealisedPnlIsPriceMinusAverageCostTimesQuantity() throws Exception {
        fill("AAPL", "BUY", 10, "100.00", NOW.minusDays(2));
        quote("AAPL", "120.00", NOW.minusSeconds(30));

        PricedPositionDto position = service.getPricedPositions(ACCOUNT_ID, ACCOUNT_ID, null).getFirst();

        assertEquals(10, position.quantity());
        assertAmount("100.00", position.averageCost());
        assertAmount("1000.00", position.costBasis());
        assertAmount("1200.00", position.marketValue());
        assertAmount("200.00", position.unrealisedPnl());
        assertAmount("20.00", position.unrealisedPnlPercent());
        assertFalse(position.stale());
    }

    @Test
    @DisplayName("a buy re-weights the average cost and a sell leaves it unchanged")
    void averageCostIsTheRunningWeightedAverage() throws Exception {
        fill("AAPL", "BUY", 10, "100.00", NOW.minusDays(3));
        fill("AAPL", "SELL", 5, "130.00", NOW.minusDays(2));
        fill("AAPL", "BUY", 5, "200.00", NOW.minusDays(1));
        quote("AAPL", "150.00", NOW);

        PricedPositionDto position = service.getPricedPositions(ACCOUNT_ID, ACCOUNT_ID, null).getFirst();

        // (5 * 100 + 5 * 200) / 10 - not the average of every buy, (10 * 100 + 5 * 200) / 15
        assertEquals(10, position.quantity());
        assertAmount("150.00", position.averageCost());
    }

    @Test
    @DisplayName("realised P&L is booked once per sale at the average cost of the time, never from today's price")
    void realisedPnlIsBookedOncePerSale() throws Exception {
        fill("AAPL", "BUY", 10, "100.00", NOW.minusDays(3));
        fill("AAPL", "SELL", 4, "110.00", NOW.minusDays(2));
        fill("AAPL", "SELL", 6, "90.00", NOW.minusDays(1));
        quote("AAPL", "500.00", NOW);

        PnlResponseDto pnl = service.getPnl(ACCOUNT_ID, ACCOUNT_ID, null, null, false);

        // 4 * (110 - 100) + 6 * (90 - 100)
        assertAmount("-20.00", pnl.realisedPnl());
        assertAmount("0.00", pnl.unrealisedPnl());
        assertTrue(service.getPricedPositions(ACCOUNT_ID, ACCOUNT_ID, null).isEmpty());
    }

    @Test
    @DisplayName("a stale quote is flagged stale, and the totals still return")
    void staleQuoteIsFlaggedAndTotalsStillReturn() throws Exception {
        fill("AAPL", "BUY", 10, "100.00", NOW.minusDays(1));
        quote("AAPL", "110.00", NOW.minusHours(1));

        PricedPositionDto position = service.getPricedPositions(ACCOUNT_ID, ACCOUNT_ID, null).getFirst();
        PortfolioSummaryDto summary = service.getPortfolioSummary(ACCOUNT_ID, ACCOUNT_ID);

        assertTrue(position.stale());
        assertEquals(NOW.minusHours(1), position.priceAsOf());
        assertAmount("1100.00", summary.marketValue());
        assertAmount("2100.00", summary.totalValue());
        assertFalse(summary.partial());
    }

    @Test
    @DisplayName("a symbol with no quote falls back to the newest stored price")
    void fallsBackToTheStoredPrice() throws Exception {
        fill("MSFT", "BUY", 2, "300.00", NOW.minusDays(1));
        when(portfolioMapper.findLatestStoredPrices(List.of("MSFT"))).thenReturn(List.of(
                new StoredPriceRow("MSFT", new BigDecimal("310.00"), NOW.minusDays(1))));

        PricedPositionDto position = service.getPricedPositions(ACCOUNT_ID, ACCOUNT_ID, null).getFirst();

        assertAmount("310.00", position.lastPrice());
        assertTrue(position.stale());
    }

    @Test
    @DisplayName("a holding that cannot be priced has null price fields and marks the summary partial")
    void unpricedHoldingMarksTheSummaryPartial() throws Exception {
        fill("AAPL", "BUY", 10, "100.00", NOW.minusDays(1));
        fill("TSLA", "BUY", 1, "250.00", NOW.minusDays(1));
        quote("AAPL", "110.00", NOW);

        List<PricedPositionDto> positions = service.getPricedPositions(ACCOUNT_ID, ACCOUNT_ID, null);
        PortfolioSummaryDto summary = service.getPortfolioSummary(ACCOUNT_ID, ACCOUNT_ID);

        PricedPositionDto tesla = positions.get(1);
        assertEquals("TSLA", tesla.symbol());
        assertNull(tesla.lastPrice());
        assertNull(tesla.marketValue());
        assertNull(tesla.unrealisedPnl());
        assertTrue(tesla.stale());
        assertTrue(summary.partial());
        assertEquals(2, summary.positionCount());
        assertAmount("1250.00", summary.costBasis());
        assertAmount("100.00", summary.unrealisedPnl());
        assertAmount("10.00", summary.unrealisedPnlPercent());
    }

    @Test
    @DisplayName("when no holding can be priced the route answers MKT-503")
    void noPriceAtAllIsPricingUnavailable() {
        fill("AAPL", "BUY", 10, "100.00", NOW.minusDays(1));

        PricingUnavailableException thrown = assertThrows(PricingUnavailableException.class,
                () -> service.getPortfolioSummary(ACCOUNT_ID, ACCOUNT_ID));
        assertEquals("MKT-503", thrown.getCode());
    }

    @Test
    @DisplayName("an empty portfolio is cash only, not an outage")
    void emptyPortfolioIsCashOnly() throws Exception {
        PortfolioSummaryDto summary = service.getPortfolioSummary(ACCOUNT_ID, ACCOUNT_ID);

        assertEquals(0, summary.positionCount());
        assertAmount("1000.00", summary.totalValue());
        assertNull(summary.unrealisedPnlPercent());
        assertFalse(summary.partial());
    }

    @Test
    @DisplayName("another customer's account is ACC-403 before anything is read")
    void tokenMismatchIsRefusedBeforeAnyRead() {
        assertThrows(AccountNotActiveException.class, () -> service.getPortfolioSummary(ACCOUNT_ID, 2L));
        verifyNoInteractions(accountMapper, portfolioMapper);
    }

    @Test
    @DisplayName("an account that does not exist is ACC-404")
    void unknownAccountIsNotFound() {
        when(accountMapper.findById(9L)).thenReturn(Optional.empty());

        assertThrows(AccountNotFoundException.class, () -> service.getPnl(9L, 9L, null, null, false));
        verify(portfolioMapper, never()).findFills(anyLong());
    }

    @Test
    @DisplayName("from later than to is VAL-422")
    void fromAfterToIsInvalid() {
        assertThrows(InvalidDateRangeException.class, () -> service.getPnl(ACCOUNT_ID, ACCOUNT_ID,
                LocalDate.parse("2026-10-04"), LocalDate.parse("2026-10-01"), false));
    }

    @Test
    @DisplayName("from and to bound the realised figure only")
    void dateRangeBoundsRealisedPnl() throws Exception {
        fill("AAPL", "BUY", 10, "100.00", OffsetDateTime.parse("2026-10-01T10:00:00Z"));
        fill("AAPL", "SELL", 2, "110.00", OffsetDateTime.parse("2026-10-02T10:00:00Z"));
        fill("AAPL", "SELL", 3, "120.00", OffsetDateTime.parse("2026-10-03T10:00:00Z"));
        quote("AAPL", "130.00", NOW);

        PnlResponseDto pnl = service.getPnl(ACCOUNT_ID, ACCOUNT_ID,
                LocalDate.parse("2026-10-03"), LocalDate.parse("2026-10-03"), false);

        assertAmount("60.00", pnl.realisedPnl());   // only the 3 @ 120 sale
        assertAmount("150.00", pnl.unrealisedPnl()); // 5 * (130 - 100), whatever the range
        assertAmount("210.00", pnl.totalPnl());
        assertNull(pnl.bySymbol());
    }

    @Test
    @DisplayName("bySymbol adds the per-instrument breakdown")
    void bySymbolBreakdown() throws Exception {
        fill("AAPL", "BUY", 10, "100.00", NOW.minusDays(2));
        fill("AAPL", "SELL", 5, "120.00", NOW.minusDays(1));
        quote("AAPL", "110.00", NOW);

        PnlResponseDto pnl = service.getPnl(ACCOUNT_ID, ACCOUNT_ID, null, null, true);

        assertEquals(1, pnl.bySymbol().size());
        assertEquals("AAPL", pnl.bySymbol().getFirst().symbol());
        assertAmount("100.00", pnl.bySymbol().getFirst().realisedPnl());
        assertAmount("50.00", pnl.bySymbol().getFirst().unrealisedPnl());
        assertAmount("150.00", pnl.bySymbol().getFirst().totalPnl());
    }

    @Test
    @DisplayName("an INR account's USD holding is totalled at the executor's fixed rate")
    void totalsAreInTheAccountCurrency() throws Exception {
        givenAccount("INR", "9000.00");
        fill("AAPL", "BUY", 1, "100.00", NOW.minusDays(1));
        quote("AAPL", "110.00", NOW);

        PortfolioSummaryDto summary = service.getPortfolioSummary(ACCOUNT_ID, ACCOUNT_ID);
        PricedPositionDto position = service.getPricedPositions(ACCOUNT_ID, ACCOUNT_ID, null).getFirst();

        assertEquals("INR", summary.baseCurrency());
        assertAmount("9900.00", summary.marketValue());
        assertAmount("18900.00", summary.totalValue());
        assertEquals("USD", position.currency());
        assertAmount("110.00", position.marketValue());
    }

    private void givenAccount(String currency, String cash) {
        when(accountMapper.findById(ACCOUNT_ID)).thenReturn(Optional.of(new AccountRow(
                ACCOUNT_ID, UUID.randomUUID(), "ACC-000001", UUID.randomUUID(), "Priya Menon",
                new BigDecimal(cash), "ACTIVE", 1, NOW, currency)));
    }

    private void fill(String symbol, String side, int quantity, String price, OffsetDateTime at) {
        fills.add(new FillRow(symbol, "USD", side, BigDecimal.valueOf(quantity), new BigDecimal(price), at));
    }

    private void quote(String symbol, String price, OffsetDateTime asOf) {
        latestQuotes.record(symbol, new BigDecimal(price), asOf);
    }

    private static void assertAmount(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual), () -> "expected " + expected + " but was " + actual);
    }
}
