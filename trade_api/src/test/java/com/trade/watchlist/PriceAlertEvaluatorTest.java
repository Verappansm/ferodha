package com.trade.watchlist;

import com.trade.mapper.ActiveAlertRow;
import com.trade.mapper.WatchlistItemMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// LEAP-007: a quote crossing the threshold triggers the alert once; one on the wrong side, or
// an alert that is no longer ACTIVE, does nothing.
class PriceAlertEvaluatorTest {

    private static final UUID ITEM = UUID.fromString("aaaaaaaa-0000-4000-8000-000000000001");
    private static final UUID USER = UUID.fromString("bbbbbbbb-0000-4000-8000-000000000002");
    private static final OffsetDateTime ARMED = OffsetDateTime.parse("2026-10-08T09:00:00Z");

    private final WatchlistItemMapper items = mock(WatchlistItemMapper.class);
    private final PriceAlertNotifier notifier = mock(PriceAlertNotifier.class);
    private final PriceAlertEvaluator evaluator = new PriceAlertEvaluator(items, notifier);

    private void givenAlert(String direction, String threshold) {
        when(items.findActiveAlertsForSymbol("AAPL")).thenReturn(List.of(new ActiveAlertRow(
                ITEM, USER, "AAPL", "Apple Inc.", new BigDecimal(threshold), direction, ARMED)));
    }

    @Test
    @DisplayName("a quote rising through an ABOVE threshold triggers it and hands it to notifications")
    void aboveCrossed() {
        givenAlert("ABOVE", "150.00");
        when(items.markTriggered(ITEM, ARMED, new BigDecimal("150.10"))).thenReturn(1);

        assertEquals(1, evaluator.evaluate("AAPL", new BigDecimal("150.10")));

        verify(notifier).notifyTriggered(eq(USER), eq("AAPL"), anyString(), eq(ITEM + ":" + ARMED.toInstant()));
    }

    @Test
    @DisplayName("a quote on the wrong side of the threshold does nothing")
    void wrongSide() {
        givenAlert("ABOVE", "150.00");
        assertEquals(0, evaluator.evaluate("AAPL", new BigDecimal("149.99")));

        givenAlert("BELOW", "150.00");
        assertEquals(0, evaluator.evaluate("AAPL", new BigDecimal("150.01")));

        verify(items, never()).markTriggered(any(), any(), any());
        verify(notifier, never()).notifyTriggered(any(), any(), any(), any());
    }

    @Test
    @DisplayName("a BELOW alert fires when the price reaches its level")
    void belowReached() {
        givenAlert("BELOW", "100.00");
        when(items.markTriggered(ITEM, ARMED, new BigDecimal("100.00"))).thenReturn(1);

        assertEquals(1, evaluator.evaluate("AAPL", new BigDecimal("100.00")));
    }

    @Test
    @DisplayName("two quotes arriving together notify once: the loser of the guarded update sends nothing")
    void firesOnce() {
        givenAlert("ABOVE", "150.00");
        when(items.markTriggered(any(), any(), any())).thenReturn(1, 0);

        evaluator.evaluate("AAPL", new BigDecimal("151.00"));
        evaluator.evaluate("AAPL", new BigDecimal("152.00"));

        verify(notifier).notifyTriggered(any(), any(), any(), any());
    }

    @Test
    @DisplayName("a failed delivery leaves the alert TRIGGERED and does not stop the next alert")
    void deliveryFailureKeepsState() {
        UUID second = UUID.randomUUID();
        when(items.findActiveAlertsForSymbol("AAPL")).thenReturn(List.of(
                new ActiveAlertRow(ITEM, USER, "AAPL", "Apple Inc.", new BigDecimal("150"), "ABOVE", ARMED),
                new ActiveAlertRow(second, USER, "AAPL", "Apple Inc.", new BigDecimal("140"), "ABOVE", ARMED)));
        when(items.markTriggered(any(), any(), any())).thenReturn(1);
        doThrow(new IllegalStateException("mail down")).doNothing()
                .when(notifier).notifyTriggered(any(), any(), any(), any());

        assertEquals(2, evaluator.evaluate("AAPL", new BigDecimal("155")));
        verify(items).markTriggered(eq(second), any(), any());
    }
}
