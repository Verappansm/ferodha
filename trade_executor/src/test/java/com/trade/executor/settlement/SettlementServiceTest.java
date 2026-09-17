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
                new BigDecimal("10.00"), "NEW");
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
                new BigDecimal("10.00"), "NEW");
        AccountRow account = new AccountRow(1L, ACCOUNT_UUID, new BigDecimal("5000.00"), "ACTIVE", 0, "USD");

        when(orderMapper.fillOrderIfNew(any(), any(), any())).thenReturn(0);

        SettlementOutcome outcome = settlementService.settleFill(order, account, new BigDecimal("10.00"), 10,
                new BigDecimal("0.10"), new BigDecimal("100.10"), OrderSide.BUY);

        assertEquals(SettlementOutcome.Result.ALREADY_PROCESSED, outcome.result());
        verify(accountMapper, never()).updateBalanceWithVersion(any(), any(), anyInt());
        verify(orderMapper, never()).insertTrade(any(), any(), any());
    }
}
