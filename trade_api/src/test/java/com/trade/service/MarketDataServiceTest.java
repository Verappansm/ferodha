package com.trade.service;

import com.trade.domain.Instrument;
import com.trade.domain.InstrumentRepository;
import com.trade.dto.InstrumentQuoteDto;
import com.trade.dto.PriceHistoryResponseDto;
import com.trade.enums.InstrumentType;
import com.trade.exception.InstrumentNotFoundException;
import com.trade.exception.InvalidParameterException;
import com.trade.mapper.MarketHistoryMapper;
import com.trade.mapper.PriceBarRow;
import com.trade.mapper.PriceRangeRow;
import com.trade.service.portfolio.LatestQuotes;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MarketDataServiceTest {

    private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-10-05T12:00:00Z");
    private static final LocalDate TODAY = LocalDate.parse("2026-10-05");

    private InstrumentRepository instruments;
    private MarketHistoryMapper history;
    private LatestQuotes quotes;
    private MarketDataService service;

    @BeforeEach
    void setUp() {
        instruments = mock(InstrumentRepository.class);
        history = mock(MarketHistoryMapper.class);
        quotes = new LatestQuotes();
        service = new MarketDataService(instruments, history, quotes, Duration.ofMinutes(5),
                Clock.fixed(NOW.toInstant(), ZoneOffset.UTC));
        when(instruments.findBySymbol("AAPL")).thenReturn(Optional.of(
                new Instrument("AAPL", "Apple Inc.", InstrumentType.EQUITY, "USD", "NASDAQ", "Technology")));
        when(history.findLatestMinuteBar(anyString())).thenReturn(Optional.empty());
        when(history.findCloseBefore(anyString(), any())).thenReturn(Optional.empty());
    }

    @Test
    @DisplayName("a fresh market-data quote is returned with bid, ask and mid, not stale")
    void freshQuote() throws Exception {
        quotes.record("AAPL", new LatestQuotes.Quote(new BigDecimal("100.05"), new BigDecimal("100.00"),
                new BigDecimal("100.10"), NOW.minusSeconds(10)));

        InstrumentQuoteDto quote = service.getQuote("AAPL");

        assertEquals("USD", quote.currency());
        assertEquals(new BigDecimal("100.00"), quote.bid());
        assertEquals(new BigDecimal("100.10"), quote.ask());
        assertEquals(new BigDecimal("100.05"), quote.mid());
        assertFalse(quote.stale());
    }

    @Test
    @DisplayName("an old quote is labelled stale, with its own time")
    void staleQuote() throws Exception {
        quotes.record("AAPL", new LatestQuotes.Quote(new BigDecimal("100.05"), NOW.minusHours(2)));

        InstrumentQuoteDto quote = service.getQuote("AAPL");

        assertTrue(quote.stale());
        assertEquals(NOW.minusHours(2), quote.asOf());
    }

    @Test
    @DisplayName("with nothing on the topic, the latest minute bar is the price; with nothing at all, every price is null")
    void fallsBackToTheLatestBarThenToNothing() throws Exception {
        assertNull(service.getQuote("AAPL").mid());
        assertTrue(service.getQuote("AAPL").stale());

        when(history.findLatestMinuteBar("AAPL")).thenReturn(Optional.of(bar(NOW.minusMinutes(1), "99.50")));
        InstrumentQuoteDto quote = service.getQuote("AAPL");

        assertEquals(new BigDecimal("99.50"), quote.mid());
        assertNull(quote.bid());
        assertFalse(quote.stale());
    }

    @Test
    @DisplayName("key statistics come from the stored history, and are omitted when it has none")
    void keyStatistics() throws Exception {
        when(history.findMinuteRange("AAPL", TODAY.atStartOfDay().atOffset(ZoneOffset.UTC)))
                .thenReturn(new PriceRangeRow(new BigDecimal("98"), new BigDecimal("102")));
        when(history.findDailyRange("AAPL", TODAY.minusDays(365)))
                .thenReturn(new PriceRangeRow(new BigDecimal("80"), new BigDecimal("120")));
        when(history.findCloseBefore("AAPL", TODAY)).thenReturn(Optional.of(new BigDecimal("101")));

        InstrumentQuoteDto quote = service.getQuote("AAPL");

        assertEquals(new BigDecimal("98"), quote.dayLow());
        assertEquals(new BigDecimal("102"), quote.dayHigh());
        assertEquals(new BigDecimal("80"), quote.week52Low());
        assertEquals(new BigDecimal("120"), quote.week52High());
        assertEquals(new BigDecimal("101"), quote.previousClose());
    }

    @Test
    @DisplayName("no figures at all means null statistics, never zero")
    void noStatisticsWithoutHistory() throws Exception {
        InstrumentQuoteDto quote = service.getQuote("AAPL");

        assertNull(quote.dayLow());
        assertNull(quote.week52High());
        assertNull(quote.previousClose());
    }

    @Test
    @DisplayName("1D reads minute bars for the last day; 1Y reads daily candles")
    void rangesPickTheirSource() throws Exception {
        when(history.findMinuteBars("AAPL", NOW.minusDays(1))).thenReturn(List.of(bar(NOW.minusMinutes(5), "100")));
        when(history.findDailyCandles("AAPL", TODAY.minusDays(366))).thenReturn(List.of(
                bar(NOW.minusDays(2), "98"), bar(NOW.minusDays(1), "99")));

        PriceHistoryResponseDto day = service.getHistory("AAPL", "1D");
        PriceHistoryResponseDto year = service.getHistory("AAPL", "1Y");

        assertEquals("1m", day.interval());
        assertEquals(1, day.points().size());
        assertEquals("1d", year.interval());
        assertEquals(2, year.points().size());
    }

    @Test
    @DisplayName("an unknown range is VAL-422")
    void unknownRange() {
        assertThrows(InvalidParameterException.class, () -> service.getHistory("AAPL", "5Y"));
        verify(history, never()).findDailyCandles(any(), any());
    }

    @Test
    @DisplayName("a delisted or unknown instrument is INS-404")
    void delistedIsNotFound() {
        Instrument delisted = new Instrument("OLD", "Old Co", InstrumentType.EQUITY, "USD", "NYSE", null);
        delisted.delist();
        when(instruments.findBySymbol("OLD")).thenReturn(Optional.of(delisted));

        assertThrows(InstrumentNotFoundException.class, () -> service.getQuote("OLD"));
        assertThrows(InstrumentNotFoundException.class, () -> service.getHistory("NOPE", "1M"));
    }

    private static PriceBarRow bar(OffsetDateTime time, String close) {
        BigDecimal price = new BigDecimal(close);
        return new PriceBarRow(time, price, price, price, price, null);
    }
}
