package com.trade.executor.settlement;

import com.trade.executor.enums.OrderSide;
import com.trade.executor.mapper.AccountMapper;
import com.trade.executor.mapper.AccountRow;
import com.trade.executor.mapper.OrderMapper;
import com.trade.executor.mapper.OrderRow;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// Isolates the retry/exhaustion logic from real transactional semantics
// (which SettlementServiceIT proves against Testcontainers Postgres) - this
// class just needs to know an exhausted budget throws rather than being
// silently swallowed.
class SettlementServiceTest {

    private static final UUID ORDER_ID = UUID.randomUUID();
    private static final UUID INSTRUMENT_ID = UUID.randomUUID();
    private static final UUID ACCOUNT_UUID = UUID.randomUUID();

    private final OrderMapper orderMapper = mock(OrderMapper.class);
    private final AccountMapper accountMapper = mock(AccountMapper.class);

    @Test
    @DisplayName("an exhausted optimistic-lock budget is reported as an error rather than ignored")
    void exhaustedOptimisticLockBudgetThrows() {
        SettlementService settlementService = new SettlementService(orderMapper, accountMapper, 3);

        OrderRow order = new OrderRow(ORDER_ID, 1L, INSTRUMENT_ID, "AAPL", "BUY", 10,
                new BigDecimal("10.00"), "NEW", 0, java.time.OffsetDateTime.now(), BigDecimal.ZERO);
        AccountRow account = new AccountRow(1L, ACCOUNT_UUID, new BigDecimal("5000.00"), "ACTIVE", 0, "USD");

        when(orderMapper.fillOrderIfNew(any(), any(), any())).thenReturn(1);
        // Every attempt loses the race, and a re-read always finds the same
        // (still-stale) row - the retry budget can never succeed.
        when(accountMapper.updateBalanceWithVersion(any(), any(), anyInt())).thenReturn(0);
        when(accountMapper.findById(1L)).thenReturn(Optional.of(account));

        assertThrows(OptimisticLockExhaustedException.class, () -> settlementService.settleFill(
                order, account, new BigDecimal("10.00"), 10, new BigDecimal("0.10"),
                new BigDecimal("100.10"), OrderSide.BUY));

        verify(accountMapper, times(3)).updateBalanceWithVersion(any(), any(), anyInt());
        verify(orderMapper, never()).insertTrade(any(), any(), any());
    }

    @Test
    @DisplayName("a second delivery affects zero rows and publishes nothing")
    void redeliveredFillIsAlreadyProcessed() {
        SettlementService settlementService = new SettlementService(orderMapper, accountMapper, 3);

        OrderRow order = new OrderRow(ORDER_ID, 1L, INSTRUMENT_ID, "AAPL", "BUY", 10,
                new BigDecimal("10.00"), "NEW", 0, java.time.OffsetDateTime.now(), BigDecimal.ZERO);
        AccountRow account = new AccountRow(1L, ACCOUNT_UUID, new BigDecimal("5000.00"), "ACTIVE", 0, "USD");

        when(orderMapper.fillOrderIfNew(any(), any(), any())).thenReturn(0);

        SettlementOutcome outcome = settlementService.settleFill(order, account, new BigDecimal("10.00"), 10,
                new BigDecimal("0.10"), new BigDecimal("100.10"), OrderSide.BUY);

        assertEquals(SettlementOutcome.Result.ALREADY_PROCESSED, outcome.result());
        verify(accountMapper, never()).updateBalanceWithVersion(any(), any(), anyInt());
        verify(orderMapper, never()).insertTrade(any(), any(), any());
    }

    @Test
    @DisplayName("a match writes a Trades row and moves cash on both sides")
    void matchWritesTradesAndMovesCashOnBothSides() {
        SettlementService settlementService = new SettlementService(orderMapper, accountMapper, 3);

        OrderRow resting = new OrderRow(UUID.randomUUID(), 2L, INSTRUMENT_ID, "AAPL", "SELL", 10,
                new BigDecimal("119.50"), "NEW", 0, java.time.OffsetDateTime.now(), BigDecimal.ZERO);
        OrderRow incoming = new OrderRow(ORDER_ID, 1L, INSTRUMENT_ID, "AAPL", "BUY", 10,
                new BigDecimal("120.00"), "NEW", 0, java.time.OffsetDateTime.now(), BigDecimal.ZERO);
        AccountRow restingAccount = new AccountRow(2L, UUID.randomUUID(), new BigDecimal("5000.00"), "ACTIVE", 0, "USD");
        AccountRow incomingAccount = new AccountRow(1L, ACCOUNT_UUID, new BigDecimal("5000.00"), "ACTIVE", 0, "USD");

        when(orderMapper.matchRestingOrderIfUnchanged(resting.orderId(), 0, 10, "FILLED", new BigDecimal("119.50"),
                new BigDecimal("5.00"))).thenReturn(1);
        when(accountMapper.updateBalanceWithVersion(any(), any(), anyInt())).thenReturn(1);

        // Deltas/fees are pre-computed by OrderBookMatcher in production
        // (fee + currency conversion already applied there) - this test only
        // proves SettlementService applies exactly the numbers it's handed,
        // on the right side, to the right account and the right order row.
        // Trade value 10 * 119.50 = 1195.00; a 5.00 fee on each side,
        // subtracted from the seller's credit, added to the buyer's debit.
        MatchOutcome outcome = settlementService.settleMatch(resting, restingAccount, OrderSide.SELL,
                new BigDecimal("1190.00"), new BigDecimal("5.00"),
                incoming, incomingAccount, OrderSide.BUY, new BigDecimal("1200.00"),
                10, new BigDecimal("119.50"), "FILLED");

        assertEquals(MatchOutcome.Result.MATCHED, outcome.result());
        verify(orderMapper).matchRestingOrderIfUnchanged(resting.orderId(), 0, 10, "FILLED",
                new BigDecimal("119.50"), new BigDecimal("5.00"));
        verify(orderMapper).insertTrade(resting.orderId(), new BigDecimal("119.50"), 10);
        verify(orderMapper).insertTrade(incoming.orderId(), new BigDecimal("119.50"), 10);
        // Seller (SELL) is credited restingCashDelta; buyer (BUY) is debited incomingCashDelta.
        verify(accountMapper).updateBalanceWithVersion(2L, new BigDecimal("6190.00"), 0);
        verify(accountMapper).updateBalanceWithVersion(1L, new BigDecimal("3800.00"), 0);
    }

    @Test
    @DisplayName("a contended resting order writes nothing")
    void contendedRestingOrderWritesNothing() {
        SettlementService settlementService = new SettlementService(orderMapper, accountMapper, 3);

        OrderRow resting = new OrderRow(UUID.randomUUID(), 2L, INSTRUMENT_ID, "AAPL", "SELL", 10,
                new BigDecimal("119.50"), "PARTIALLY_FILLED", 3, java.time.OffsetDateTime.now(), BigDecimal.ZERO);
        OrderRow incoming = new OrderRow(ORDER_ID, 1L, INSTRUMENT_ID, "AAPL", "BUY", 10,
                new BigDecimal("120.00"), "NEW", 0, java.time.OffsetDateTime.now(), BigDecimal.ZERO);
        AccountRow restingAccount = new AccountRow(2L, UUID.randomUUID(), new BigDecimal("5000.00"), "ACTIVE", 0, "USD");
        AccountRow incomingAccount = new AccountRow(1L, ACCOUNT_UUID, new BigDecimal("5000.00"), "ACTIVE", 0, "USD");

        // Someone else already advanced this resting order's filled_quantity past 3.
        when(orderMapper.matchRestingOrderIfUnchanged(resting.orderId(), 3, 7, "FILLED", new BigDecimal("119.50"),
                new BigDecimal("3.50"))).thenReturn(0);

        MatchOutcome outcome = settlementService.settleMatch(resting, restingAccount, OrderSide.SELL,
                new BigDecimal("833.00"), new BigDecimal("3.50"),
                incoming, incomingAccount, OrderSide.BUY, new BigDecimal("840.00"),
                7, new BigDecimal("119.50"), "FILLED");

        assertEquals(MatchOutcome.Result.CONTENDED, outcome.result());
        verify(orderMapper, never()).insertTrade(any(), any(), any());
        verify(accountMapper, never()).updateBalanceWithVersion(any(), any(), anyInt());
    }

    @Test
    @DisplayName("finalizing an incoming order after a partial match sets PARTIALLY_FILLED")
    void finalizeIncomingOrderSetsPartiallyFilled() {
        SettlementService settlementService = new SettlementService(orderMapper, accountMapper, 3);

        OrderRow incoming = new OrderRow(ORDER_ID, 1L, INSTRUMENT_ID, "AAPL", "BUY", 10,
                new BigDecimal("120.00"), "NEW", 0, java.time.OffsetDateTime.now(), BigDecimal.ZERO);

        when(orderMapper.matchIncomingOrderIfNew(ORDER_ID, 6, "PARTIALLY_FILLED", new BigDecimal("119.50"),
                new BigDecimal("3.00"))).thenReturn(1);

        SettlementOutcome outcome = settlementService.finalizeIncomingOrder(
                incoming, 6, new BigDecimal("119.50"), "PARTIALLY_FILLED", new BigDecimal("3.00"));

        assertEquals(SettlementOutcome.Result.FILLED, outcome.result());
        verify(orderMapper).matchIncomingOrderIfNew(ORDER_ID, 6, "PARTIALLY_FILLED", new BigDecimal("119.50"),
                new BigDecimal("3.00"));
    }
}
