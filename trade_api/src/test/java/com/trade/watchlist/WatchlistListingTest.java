package com.trade.watchlist;

import com.trade.domain.Instrument;
import com.trade.domain.InstrumentRepository;
import com.trade.dto.IntradayPricePoint;
import com.trade.dto.WatchlistItemResponse;
import com.trade.dto.WatchlistResponse;
import com.trade.enums.InstrumentType;
import com.trade.service.MarketDataService;
import com.trade.service.MarketDataService.PriceMove;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// Listing watchlists loads the items, the instruments and the prices once each for
// the whole page, never once per item (no N+1 queries).
class WatchlistListingTest {

    private static final UUID OWNER = UUID.randomUUID();
    private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-10-16T10:00:00Z");

    private final WatchlistRepository watchlists = mock(WatchlistRepository.class);
    private final WatchlistItemRepository items = mock(WatchlistItemRepository.class);
    private final InstrumentRepository instruments = mock(InstrumentRepository.class);
    private final MarketDataService marketData = mock(MarketDataService.class);
    private final WatchlistService service = new WatchlistService(watchlists, items, instruments, marketData);

    private static Instrument instrument(UUID id, String symbol) {
        return new Instrument(id, symbol, symbol + " Inc", InstrumentType.EQUITY, "USD", "NASDAQ", "Tech");
    }

    @Test
    @DisplayName("two watchlists with three items take one item, one instrument and one price lookup in all")
    void batchedLookups() throws Exception {
        Watchlist tech = new Watchlist(UUID.randomUUID(), "Tech", OWNER, 1);
        Watchlist chips = new Watchlist(UUID.randomUUID(), "Chips", OWNER, 0);
        UUID aapl = UUID.randomUUID();
        UUID nvda = UUID.randomUUID();
        when(watchlists.findByUserId(OWNER)).thenReturn(List.of(tech, chips));
        when(items.findByWatchlistIds(anyCollection())).thenReturn(List.of(
                new WatchlistItem(UUID.randomUUID(), tech.getWatchlistId(), aapl, 2, NOW, null, null),
                new WatchlistItem(UUID.randomUUID(), tech.getWatchlistId(), nvda, 1, NOW, null, null),
                new WatchlistItem(UUID.randomUUID(), chips.getWatchlistId(), nvda, 1, NOW, null, null)));
        when(instruments.findByInstrumentIds(anyCollection())).thenReturn(Map.of(
                aapl, instrument(aapl, "AAPL"), nvda, instrument(nvda, "NVDA")));
        when(marketData.getPriceMoves(anyCollection())).thenReturn(Map.of(
                "AAPL", new PriceMove(new BigDecimal("110.00"), NOW, new BigDecimal("100.00"))));

        List<WatchlistResponse> result = service.getWatchlists(OWNER);

        // Sorted by display order, lists and items alike.
        assertEquals(List.of("Chips", "Tech"), result.stream().map(WatchlistResponse::name).toList());
        List<WatchlistItemResponse> techItems = result.get(1).items();
        assertEquals(List.of("NVDA", "AAPL"), techItems.stream().map(WatchlistItemResponse::symbol).toList());
        // AAPL is priced with its day move; NVDA has no price and stays at zero.
        assertEquals(110.0, techItems.get(1).lastPrice());
        assertEquals(10.0, techItems.get(1).dayChange());
        assertEquals(10.0, techItems.get(1).dayChangePercent());
        assertEquals(0.0, techItems.get(0).lastPrice());

        verify(items, times(1)).findByWatchlistIds(anyCollection());
        verify(items, never()).findByWatchlistId(any());
        verify(instruments, times(1)).findByInstrumentIds(anyCollection());
        verify(instruments, never()).findByInstrumentId(any());
        verify(marketData, times(1)).getPriceMoves(anyCollection());
        verify(marketData, never()).getQuote(any());
        // The overview carries no sparklines: that would be every point of every list.
        verify(marketData, never()).getIntradayCloses(anyCollection());
    }

    @Test
    @DisplayName("one list's items come with their sparklines from a single lookup")
    void itemsWithSparklines() throws Exception {
        Watchlist tech = new Watchlist(UUID.randomUUID(), "Tech", OWNER, 0);
        UUID aapl = UUID.randomUUID();
        UUID msft = UUID.randomUUID();
        when(watchlists.findById(tech.getWatchlistId())).thenReturn(Optional.of(tech));
        when(items.findByWatchlistId(tech.getWatchlistId())).thenReturn(List.of(
                new WatchlistItem(UUID.randomUUID(), tech.getWatchlistId(), aapl, 1, NOW, null, null),
                new WatchlistItem(UUID.randomUUID(), tech.getWatchlistId(), msft, 2, NOW, null, null)));
        when(instruments.findByInstrumentIds(anyCollection())).thenReturn(Map.of(
                aapl, instrument(aapl, "AAPL"), msft, instrument(msft, "MSFT")));
        List<IntradayPricePoint> points = List.of(new IntradayPricePoint(NOW, 101.0), new IntradayPricePoint(NOW, 102.0));
        when(marketData.getIntradayCloses(anyCollection())).thenReturn(Map.of("AAPL", points));

        List<WatchlistItemResponse> result = service.getItems(OWNER, tech.getWatchlistId());

        assertEquals(points, result.get(0).intradayData());
        assertEquals(List.of(), result.get(1).intradayData());
        verify(marketData, times(1)).getIntradayCloses(anyCollection());
        verify(marketData, never()).getHistory(any(), any());
    }

    @Test
    @DisplayName("a user with no watchlists costs no item, instrument or price lookup")
    void noWatchlists() {
        when(watchlists.findByUserId(OWNER)).thenReturn(List.of());

        assertEquals(List.of(), service.getWatchlists(OWNER));
        verify(items, never()).findByWatchlistIds(anyCollection());
        verify(instruments, never()).findByInstrumentIds(anyCollection());
        verify(marketData, never()).getPriceMoves(anyCollection());
    }
}
