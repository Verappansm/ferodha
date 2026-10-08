package com.trade.watchlist;

import com.trade.domain.InstrumentRepository;
import com.trade.dto.PriceAlertDtos.CreatePriceAlertRequest;
import com.trade.dto.PriceAlertDtos.UpdatePriceAlertRequest;
import com.trade.exception.InvalidRequestException;
import com.trade.exception.WatchlistNotFoundException;
import com.trade.service.MarketDataService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// LEAP-007: a threshold is a positive price with at most two decimals; setting one arms the
// alert, clearing it cancels it, and another customer's item is out of reach.
class WatchlistAlertRulesTest {

    private static final UUID OWNER = UUID.randomUUID();
    private static final UUID WATCHLIST = UUID.randomUUID();
    private static final UUID ITEM = UUID.randomUUID();

    private final WatchlistRepository watchlists = mock(WatchlistRepository.class);
    private final WatchlistItemRepository items = mock(WatchlistItemRepository.class);
    private final WatchlistService service = new WatchlistService(watchlists, items,
            mock(InstrumentRepository.class), mock(MarketDataService.class));

    private void givenOwnedItem() {
        when(items.findById(ITEM)).thenReturn(Optional.of(new WatchlistItem(
                ITEM, WATCHLIST, UUID.randomUUID(), 1, OffsetDateTime.now(), null, null)));
        when(watchlists.findById(WATCHLIST)).thenReturn(Optional.of(new Watchlist(WATCHLIST, "Tech", OWNER, 0)));
    }

    @Test
    @DisplayName("a threshold of zero, below zero or with three decimals is refused and nothing is armed")
    void invalidThresholds() {
        givenOwnedItem();
        for (String price : new String[] {"0", "-1", "10.005"}) {
            assertThrows(InvalidRequestException.class, () -> service.createPriceAlert(OWNER,
                    new CreatePriceAlertRequest(ITEM, new BigDecimal(price), "ABOVE")));
        }
        assertThrows(InvalidRequestException.class, () -> service.createPriceAlert(OWNER,
                new CreatePriceAlertRequest(ITEM, new BigDecimal("10"), "SIDEWAYS")));
        verify(items, never()).armAlert(any(), any(), any());
    }

    @Test
    @DisplayName("setting an alert arms it; clearing it cancels it rather than deleting it")
    void armAndCancel() throws Exception {
        givenOwnedItem();

        service.createPriceAlert(OWNER, new CreatePriceAlertRequest(ITEM, new BigDecimal("150.25"), "ABOVE"));
        verify(items).armAlert(ITEM, new BigDecimal("150.25"), "ABOVE");

        service.updatePriceAlert(OWNER, ITEM, new UpdatePriceAlertRequest(null, null));
        verify(items).cancelAlert(ITEM);
    }

    @Test
    @DisplayName("another customer's item reads as not found, and nothing changes")
    void otherCustomersItem() {
        givenOwnedItem();
        assertThrows(WatchlistNotFoundException.class, () -> service.createPriceAlert(UUID.randomUUID(),
                new CreatePriceAlertRequest(ITEM, new BigDecimal("150"), "ABOVE")));
        verify(items, never()).armAlert(any(), any(), any());
    }
}
