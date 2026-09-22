package com.trade.executor.domain;

import com.trade.executor.mapper.AccountMapper;
import com.trade.executor.mapper.AccountRow;
import com.trade.executor.mapper.OrderMapper;
import com.trade.executor.mapper.OrderRow;
import com.trade.executor.settlement.MatchOutcome;
import com.trade.executor.settlement.SettlementService;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// Orchestration only - mocked mappers/SettlementService, the same style
// OrderExecutionServiceTest/SettlementServiceTest already use. Real
// transactional proof (does the DB actually roll back atomically, does a
// concurrent match against a real Postgres row really lose the race) needs
// Testcontainers and is out of reach in this environment (no Docker) -
// flagged here rather than glossed over, same as every other *IT gap this
// session has been honest about.
class OrderBookMatcherTest {

    private static final UUID INCOMING_ID = UUID.randomUUID();
    private static final UUID INSTRUMENT_ID = UUID.randomUUID();

    private final OrderMapper orderMapper = mock(OrderMapper.class);
    private final AccountMapper accountMapper = mock(AccountMapper.class);
    private final SettlementService settlementService = mock(SettlementService.class);
    private final OrderBookMatcher matcher = new OrderBookMatcher(orderMapper, accountMapper, settlementService);

    private static OrderRow order(UUID id, String side, int quantity, BigDecimal price, int filled) {
        return new OrderRow(id, 1L, INSTRUMENT_ID, "AAPL", side, quantity, price, "NEW", filled, OffsetDateTime.now());
    }

    private static AccountRow account(long id) {
        return new AccountRow(id, UUID.randomUUID(), new BigDecimal("10000.00"), "ACTIVE", 0, "USD");
    }

    @Test
    void fullyMatchesAgainstOneRestingOrderOfEqualQuantity() {
        OrderRow incoming = order(INCOMING_ID, "BUY", 10, new BigDecimal("120.00"), 0);
        OrderRow resting = order(UUID.randomUUID(), "SELL", 10, new BigDecimal("119.50"), 0);
        AccountRow incomingAccount = account(1L);
        AccountRow restingAccount = account(2L);

        when(orderMapper.findRestingOpposite(INSTRUMENT_ID, "SELL", incoming.limitPrice(), INCOMING_ID))
                .thenReturn(List.of(resting));
        when(accountMapper.findById(resting.accountId())).thenReturn(Optional.of(restingAccount));
        when(settlementService.settleMatch(any(), any(), any(), any(), any(), any(), anyInt(), any(), eq("FILLED")))
                .thenReturn(MatchOutcome.matched());

        OrderBookMatcher.Result result = matcher.match(incoming, incomingAccount);

        assertEquals(10, result.totalMatched());
        assertEquals(new BigDecimal("119.50"), result.lastExecutionPrice());
        // Price improvement: executes at the resting order's own price, not the incoming order's limit.
        verify(settlementService).settleMatch(eq(resting), eq(restingAccount), any(),
                eq(incoming), eq(incomingAccount), any(), eq(10), eq(new BigDecimal("119.50")), eq("FILLED"));
    }

    @Test
    void partiallyMatchesWhenRestingQuantityIsSmallerAndLeavesTheRemainderResting() {
        OrderRow incoming = order(INCOMING_ID, "SELL", 5, new BigDecimal("120.00"), 0);
        OrderRow resting = order(UUID.randomUUID(), "BUY", 3, new BigDecimal("120.00"), 0);
        AccountRow incomingAccount = account(1L);
        AccountRow restingAccount = account(2L);

        // First query finds the resting order; once it's fully consumed a
        // real re-query would no longer return it (its status moves past
        // NEW/PARTIALLY_FILLED's WHERE clause) - the second call simulates
        // that by coming back empty, which is what actually stops the walk.
        when(orderMapper.findRestingOpposite(INSTRUMENT_ID, "BUY", incoming.limitPrice(), INCOMING_ID))
                .thenReturn(List.of(resting), List.of());
        when(accountMapper.findById(resting.accountId())).thenReturn(Optional.of(restingAccount));
        when(settlementService.settleMatch(any(), any(), any(), any(), any(), any(), eq(3), any(), eq("FILLED")))
                .thenReturn(MatchOutcome.matched());

        OrderBookMatcher.Result result = matcher.match(incoming, incomingAccount);

        // Only 3 of the incoming order's 5 shares found a counterparty - the
        // other 2 rest, which is what OrderExecutionService turns into
        // PARTIALLY_FILLED rather than FILLED.
        assertEquals(3, result.totalMatched());
    }

    @Test
    void noCrossingResultsInNoMatchAndNoSettlementCall() {
        OrderRow incoming = order(INCOMING_ID, "BUY", 10, new BigDecimal("100.00"), 0);
        AccountRow incomingAccount = account(1L);

        when(orderMapper.findRestingOpposite(INSTRUMENT_ID, "SELL", incoming.limitPrice(), INCOMING_ID))
                .thenReturn(List.of());

        OrderBookMatcher.Result result = matcher.match(incoming, incomingAccount);

        assertEquals(0, result.totalMatched());
        assertNull(result.lastExecutionPrice());
        verify(settlementService, never()).settleMatch(any(), any(), any(), any(), any(), any(), anyInt(), any(), any());
    }

    @Test
    void contendedRestingOrderIsSkippedInFavourOfTheNextCandidate() {
        OrderRow incoming = order(INCOMING_ID, "BUY", 10, new BigDecimal("120.00"), 0);
        OrderRow contended = order(UUID.randomUUID(), "SELL", 10, new BigDecimal("119.00"), 0);
        OrderRow next = order(UUID.randomUUID(), "SELL", 10, new BigDecimal("119.50"), 0);
        AccountRow incomingAccount = account(1L);
        AccountRow contendedAccount = account(2L);
        AccountRow nextAccount = account(3L);

        // Both candidates come back in the same pass - contended is tried
        // first (better price), fails, and the walk moves on to next
        // within the same pass rather than re-querying immediately.
        when(orderMapper.findRestingOpposite(INSTRUMENT_ID, "SELL", incoming.limitPrice(), INCOMING_ID))
                .thenReturn(List.of(contended, next));
        when(accountMapper.findById(contended.accountId())).thenReturn(Optional.of(contendedAccount));
        when(accountMapper.findById(next.accountId())).thenReturn(Optional.of(nextAccount));
        when(settlementService.settleMatch(eq(contended), any(), any(), any(), any(), any(), anyInt(), any(), any()))
                .thenReturn(MatchOutcome.contended());
        when(settlementService.settleMatch(eq(next), any(), any(), any(), any(), any(), anyInt(), any(), any()))
                .thenReturn(MatchOutcome.matched());

        OrderBookMatcher.Result result = matcher.match(incoming, incomingAccount);

        assertEquals(10, result.totalMatched());
        assertEquals(new BigDecimal("119.50"), result.lastExecutionPrice());
        verify(settlementService, times(1)).settleMatch(eq(contended), any(), any(), any(), any(), any(), anyInt(), any(), any());
        verify(settlementService, times(1)).settleMatch(eq(next), any(), any(), any(), any(), any(), anyInt(), any(), any());
    }
}
