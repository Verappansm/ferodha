package com.trade.strategy;

import com.trade.dto.PlaceOrderRequestDto;
import com.trade.mapper.PositionMapper;
import com.trade.mapper.PositionRow;
import com.trade.strategy.mapper.StrategyMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class StrategyEngineTest {

    private static final String ID = "11111111-1111-1111-1111-111111111111";
    private static final Instant NOW = Instant.parse("2026-10-07T10:00:00Z");
    private static final OffsetDateTime AS_OF = OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC);

    private final StrategyMapper mapper = mock(StrategyMapper.class);
    private final PositionMapper positions = mock(PositionMapper.class);
    private final OrderPlacer placer = mock(OrderPlacer.class);
    private final StrategyTokenIssuer tokens = new StrategyTokenIssuer("unit-test-secret-at-least-32-characters-long", "auth-service");
    private StrategyEngine engine;

    @BeforeEach
    void setUp() {
        engine = new StrategyEngine(mapper, positions, placer, tokens, new BigDecimal("0.001"),
                Duration.ofMinutes(15), Clock.fixed(NOW, ZoneOffset.UTC));
        when(mapper.committedSpend(ID)).thenReturn(BigDecimal.ZERO);
        when(mapper.pendingQuantity(eq(1L), eq("AAPL"), anyString())).thenReturn(0L);
        when(positions.find(1L, "AAPL")).thenReturn(Optional.empty());
        when(mapper.claim(eq(ID), any())).thenReturn(1);
        when(placer.place(anyString(), any())).thenReturn("ORD-abc");
    }

    private Strategy buy(String lastPrice) {
        return new Strategy(ID, "22222222-2222-2222-2222-222222222222", 1L, "dip", "AAPL", "BUY",
                new BigDecimal("100.00"), 50, new BigDecimal("10000.00"), 100, 1, 3, false, "ENABLED", 0, 0,
                lastPrice == null ? null : new BigDecimal(lastPrice), null, null);
    }

    private void quote(Strategy s, String bid, String ask) {
        when(mapper.findEnabledBySymbol("AAPL")).thenReturn(List.of(s));
        engine.onQuote("AAPL", new BigDecimal(bid), new BigDecimal(ask), AS_OF);
    }

    @Test
    @DisplayName("A BUY that crosses places one order through the order route at the buffered ask, then tags it")
    void firesOnCrossing() {
        quote(buy("100.50"), "99.80", "99.90");

        ArgumentCaptor<PlaceOrderRequestDto> order = ArgumentCaptor.forClass(PlaceOrderRequestDto.class);
        verify(placer).place(anyString(), order.capture());
        assertEquals(new BigDecimal("99.92"), order.getValue().price()); // 99.90 x 1.0002, rounded up
        assertEquals(50, order.getValue().quantity());
        assertEquals(1L, order.getValue().accountId());
        assertEquals("strat-" + ID + "-" + AS_OF.toEpochSecond(), order.getValue().idempotencyKey());
        verify(mapper).tagOrder(order.getValue().idempotencyKey(), ID);
        verify(mapper).completeIfDone(ID);
        verify(mapper).insertEvent(eq(ID), eq("PLACED"), contains("ORD-abc"));
    }

    @Test
    @DisplayName("A price that stays below the level does not fire again")
    void noRepeatOnAHeldLevel() {
        quote(buy("99.90"), "99.40", "99.50");
        verify(placer, never()).place(anyString(), any());
        verify(mapper).setLastPrice(ID, new BigDecimal("99.50"));
    }

    @Test
    @DisplayName("The first price after enabling fires when the level is already met, like a limit order")
    void firstObservationFiresWhenAlreadyMet() {
        quote(buy(null), "50.00", "50.10");
        verify(placer).place(anyString(), any());
    }

    @Test
    @DisplayName("The first price after enabling only logs what it is waiting for when the level is not met")
    void firstObservationWatchesWhenNotMet() {
        quote(buy(null), "119.90", "120.00");
        verify(placer, never()).place(anyString(), any());
        verify(mapper).insertEvent(eq(ID), eq("WATCHING"), contains("will buy when the ask falls to 100.00"));
        verify(mapper).setLastPrice(ID, new BigDecimal("120.00"));
    }

    @Test
    @DisplayName("Disabled in the middle of a cycle: the claim is refused and nothing is placed")
    void disabledMidCycleStopsTheOrder() {
        when(mapper.claim(eq(ID), any())).thenReturn(0); // the customer disabled it just now
        quote(buy("100.50"), "99.80", "99.90");

        verify(placer, never()).place(anyString(), any());
        verify(mapper).insertEvent(eq(ID), eq("SKIPPED"), anyString());
    }

    @Test
    @DisplayName("A refusal by the customer's own cap is BLOCKED, places nothing and is not a failure")
    void blockedByLimits() {
        when(mapper.committedSpend(ID)).thenReturn(new BigDecimal("9000.00"));
        quote(buy("100.50"), "99.80", "99.90");

        verify(placer, never()).place(anyString(), any());
        verify(mapper, never()).recordFailure(anyString());
        verify(mapper).insertEvent(eq(ID), eq("BLOCKED"), contains("Max spend"));
    }

    @Test
    @DisplayName("Pending buys count towards the position cap")
    void pendingUnitsCount() {
        when(mapper.pendingQuantity(eq(1L), eq("AAPL"), eq("BUY"))).thenReturn(60L);
        quote(buy("100.50"), "99.80", "99.90");

        verify(placer, never()).place(anyString(), any());
        verify(mapper).insertEvent(eq(ID), eq("BLOCKED"), contains("Max position"));
    }

    @Test
    @DisplayName("A dry run logs what it would do and places nothing")
    void dryRun() {
        Strategy s = buy("100.50");
        Strategy dry = new Strategy(s.strategyId(), s.userId(), s.accountId(), s.name(), s.symbol(), s.side(),
                s.triggerPrice(), s.quantity(), s.maxSpend(), s.maxPosition(), s.maxOrders(), s.maxFailures(),
                true, s.status(), 0, 0, s.lastPrice(), null, null);
        quote(dry, "99.80", "99.90");

        verify(placer, never()).place(anyString(), any());
        verify(mapper, never()).claim(anyString(), any());
        verify(mapper).insertEvent(eq(ID), eq("WOULD_FIRE"), anyString());
    }

    @Test
    @DisplayName("A failed placement gives the order budget back, records a failure and trips at the limit")
    void failureTripsTheBreaker() {
        when(placer.place(anyString(), any())).thenThrow(new OrderPlacer.OrderPlacementException("The order route answered 500"));
        Strategy tripped = new Strategy(ID, "u", 1L, "dip", "AAPL", "BUY", new BigDecimal("100.00"), 50,
                new BigDecimal("10000.00"), 100, 1, 3, false, "TRIPPED", 0, 3, null, null, null);
        when(mapper.findById(ID)).thenReturn(tripped);
        quote(buy("100.50"), "99.80", "99.90");

        verify(mapper).release(ID);
        verify(mapper).recordFailure(ID);
        verify(mapper).insertEvent(eq(ID), eq("FAILED"), contains("500"));
        verify(mapper).insertEvent(eq(ID), eq("TRIPPED"), anyString());
    }

    @Test
    @DisplayName("An error after the order was saved still counts as placed: no release, no failure")
    void orderSavedButRouteFailed() {
        when(placer.place(anyString(), any())).thenThrow(new OrderPlacer.OrderPlacementException("The order route answered 500"));
        when(mapper.tagOrder(anyString(), eq(ID))).thenReturn(1);
        quote(buy("100.50"), "99.80", "99.90");

        verify(mapper, never()).release(anyString());
        verify(mapper, never()).recordFailure(anyString());
        verify(mapper).completeIfDone(ID);
        verify(mapper).insertEvent(eq(ID), eq("PLACED"), contains("500"));
    }

    @Test
    @DisplayName("An unexpected error fails closed: no order, a recorded failure")
    void unexpectedErrorFailsClosed() {
        when(mapper.committedSpend(ID)).thenThrow(new IllegalStateException("db down"));
        quote(buy("100.50"), "99.80", "99.90");

        verify(placer, never()).place(anyString(), any());
        verify(mapper).recordFailure(ID);
    }

    @Test
    @DisplayName("A stale quote is ignored entirely")
    void staleQuoteIgnored() {
        when(mapper.findEnabledBySymbol("AAPL")).thenReturn(List.of(buy("100.50")));
        engine.onQuote("AAPL", new BigDecimal("99.80"), new BigDecimal("99.90"), AS_OF.minusMinutes(20));
        verify(mapper, never()).findEnabledBySymbol(anyString());
        verify(placer, never()).place(anyString(), any());
    }

    @Test
    @DisplayName("A SELL watches the bid and needs units to sell")
    void sellUsesTheBid() {
        Strategy s = new Strategy(ID, "u", 1L, "exit", "AAPL", "SELL", new BigDecimal("100.00"), 50,
                null, null, 1, 3, false, "ENABLED", 0, 0, new BigDecimal("99.50"), null, null);
        when(positions.find(1L, "AAPL")).thenReturn(Optional.of(new PositionRow(1L, "AAPL", 80L, new BigDecimal("90"))));
        quote(s, "100.30", "100.40");

        ArgumentCaptor<PlaceOrderRequestDto> order = ArgumentCaptor.forClass(PlaceOrderRequestDto.class);
        verify(placer).place(anyString(), order.capture());
        assertEquals(new BigDecimal("100.27"), order.getValue().price()); // 100.30 x 0.9998, rounded down
    }

    @Test
    @DisplayName("A rejected strategy order counts as a failure; a filled one ends the streak")
    void outcomesFromTradeEvents() {
        String orderUuid = "33333333-3333-3333-3333-333333333333";
        when(mapper.strategyIdOfOrder(orderUuid)).thenReturn(ID);

        engine.onOrderRejected("ORD-" + orderUuid, "NOT_MARKETABLE");
        verify(mapper).recordFailure(ID);
        verify(mapper).insertEvent(eq(ID), eq("FAILED"), contains("NOT_MARKETABLE"));

        engine.onOrderFilled("ORD-" + orderUuid);
        verify(mapper).resetFailures(ID);
        verify(mapper).insertEvent(eq(ID), eq("FILLED"), anyString());
    }

    @Test
    @DisplayName("An order that does not belong to a strategy is ignored")
    void customerOrdersIgnored() {
        engine.onOrderRejected("ORD-44444444-4444-4444-4444-444444444444", "NOT_MARKETABLE");
        verify(mapper, never()).recordFailure(anyString());
    }
}
