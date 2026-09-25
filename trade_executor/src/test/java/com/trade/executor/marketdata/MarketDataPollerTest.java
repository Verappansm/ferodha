package com.trade.executor.marketdata;

import com.trade.executor.event.MarketDataPublisher;
import com.trade.executor.fauxnance.Quote;
import com.trade.executor.fauxnance.QuoteSource;
import com.trade.executor.mapper.PollableSymbolMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.TaskScheduler;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// Story 8's remaining "Unit Test Execution Paths": each quote is published
// as its own message keyed by symbol (never one message per batch), and a
// batch never exceeds 25 symbols.
class MarketDataPollerTest {

    private final PollableSymbolMapper symbolMapper = mock(PollableSymbolMapper.class);
    private final QuoteSource quoteSource = mock(QuoteSource.class);
    private final MarketDataPublisher publisher = mock(MarketDataPublisher.class);
    private final TaskScheduler taskScheduler = mock(TaskScheduler.class);
    private final PollScheduleCalculator scheduleCalculator = new PollScheduleCalculator(2000, 25);

    private MarketDataPoller poller;

    @BeforeEach
    void setUp() {
        poller = new MarketDataPoller(symbolMapper, quoteSource, publisher, taskScheduler, scheduleCalculator, 60);
    }

    @Test
    @DisplayName("each quote is published as its own message keyed by symbol, not one message per batch")
    void publishesOneMessagePerSymbol() {
        when(symbolMapper.findPollableSymbols()).thenReturn(List.of("AAPL", "MSFT"));
        Map<String, Quote> quotes = new LinkedHashMap<>();
        quotes.put("AAPL", new Quote("AAPL", new BigDecimal("99"), new BigDecimal("100"), "USD"));
        quotes.put("MSFT", new Quote("MSFT", new BigDecimal("199"), new BigDecimal("200"), "USD"));
        when(quoteSource.fetchQuotes(List.of("AAPL", "MSFT"))).thenReturn(quotes);

        poller.pollOnce();

        verify(publisher, times(1)).publishQuote(eq("AAPL"), any());
        verify(publisher, times(1)).publishQuote(eq("MSFT"), any());
        verify(publisher, times(2)).publishQuote(any(), any());
    }

    @Test
    @DisplayName("more than 25 symbols are split into batches of at most 25")
    void splitsMoreThan25SymbolsIntoBatches() {
        List<String> symbols = IntStream.rangeClosed(1, 30).mapToObj(i -> "SYM" + i).toList();
        when(symbolMapper.findPollableSymbols()).thenReturn(symbols);
        when(quoteSource.fetchQuotes(any())).thenReturn(Map.of());

        poller.pollOnce();

        verify(quoteSource, times(2)).fetchQuotes(argThat((List<String> batch) -> batch.size() <= 25));
    }

    @Test
    @DisplayName("no pollable symbols means no Fauxnance call and nothing published")
    void noSymbolsMeansNoWork() {
        when(symbolMapper.findPollableSymbols()).thenReturn(List.of());

        poller.pollOnce();

        verify(quoteSource, never()).fetchQuotes(any());
        verify(publisher, never()).publishQuote(any(), any());
    }
}
