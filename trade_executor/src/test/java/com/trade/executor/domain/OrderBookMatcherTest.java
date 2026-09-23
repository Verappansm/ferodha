package com.trade.executor.domain;

import com.trade.executor.currency.CurrencyConverter;
import com.trade.executor.event.TradeEventPublisher;
import com.trade.executor.fee.FeeCalculator;
import com.trade.executor.mapper.AccountMapper;
import com.trade.executor.mapper.AccountRow;
import com.trade.executor.mapper.InstrumentRow;
import com.trade.executor.mapper.OrderMapper;
import com.trade.executor.mapper.OrderRow;
import com.trade.executor.mapper.PositionMapper;
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
// FeeCalculator/CurrencyConverter instances at 0% and same-currency (USD)
// throughout, the same reason OrderExecutionServiceTest wires them for
// real rather than mocking: fee/currency math itself is already covered
// by FeeCalculatorTest/CurrencyConverterTest, this class only needs to
// prove the walk's own logic (candidate order, contention handling,
// affordability/holdings re-checks, quantity accounting). Real
// transactional proof (does the DB actually roll back atomically, does a
// concurrent match against a real Postgres row really lose the race)
// needs Testcontainers and is out of reach in this environment (no
// Docker) - flagged here rather than glossed over, same as every other
// *IT gap this session has been honest about.
class OrderBookMatcherTest {

    private static final UUID INCOMING_ID = UUID.randomUUID();
    private static final UUID INSTRUMENT_ID = UUID.randomUUID();
    private static final InstrumentRow INSTRUMENT = new InstrumentRow(INSTRUMENT_ID, "AAPL", "USD", true);
    // Ample resting holdings by default, so a SELL resting order's
    // execution-time holdings re-check passes unless a test deliberately
    // wants it to fail - every account gets its own UUID from account(),
    // so any(Optional)-shaped stub can't accidentally cross-match.
    private static final long AMPLE_HOLDINGS = 1_000L;

    private final OrderMapper orderMapper = mock(OrderMapper.class);
    private final AccountMapper accountMapper = mock(AccountMapper.class);
    private final PositionMapper positionMapper = mock(PositionMapper.class);
    private final SettlementService settlementService = mock(SettlementService.class);
    private final CurrencyConverter currencyConverter = new CurrencyConverter();
    private final FeeCalculator feeCalculator = new FeeCalculator(BigDecimal.ZERO);
    private final TradeEventPublisher tradeEventPublisher = mock(TradeEventPublisher.class);
    private final OrderBookMatcher matcher = new OrderBookMatcher(
            orderMapper, accountMapper, positionMapper, settlementService, currencyConverter, feeCalculator,
            tradeEventPublisher);

    private static OrderRow order(UUID id, long accountId, String side, int quantity, BigDecimal price, int filled) {
        return new OrderRow(id, accountId, INSTRUMENT_ID, "AAPL", side, quantity, price, "NEW", filled, OffsetDateTime.now());
    }

    private static AccountRow account(long id) {
        return new AccountRow(id, UUID.randomUUID(), new BigDecimal("10000.00"), "ACTIVE", 0, "USD");
    }

    /** Wires accountMapper + (for a SELL) an ample-holdings positionMapper stub for one resting order/account pair. */
    private void givenRestingAccountIsUsable(OrderRow resting, AccountRow restingAccount) {
        when(accountMapper.findById(resting.accountId())).thenReturn(Optional.of(restingAccount));
        if ("SELL".equals(resting.side())) {
            when(positionMapper.findHeldQuantity(restingAccount.accountUuid(), INSTRUMENT_ID)).thenReturn(AMPLE_HOLDINGS);
        }
    }

    @Test
    void fullyMatchesAgainstOneRestingOrderOfEqualQuantity() {
        OrderRow incoming = order(INCOMING_ID, 1L, "BUY", 10, new BigDecimal("120.00"), 0);
        OrderRow resting = order(UUID.randomUUID(), 2L, "SELL", 10, new BigDecimal("119.50"), 0);
        AccountRow incomingAccount = account(1L);
        AccountRow restingAccount = account(2L);

        when(orderMapper.findRestingOpposite(INSTRUMENT_ID, "SELL", incoming.limitPrice(), INCOMING_ID))
                .thenReturn(List.of(resting));
        givenRestingAccountIsUsable(resting, restingAccount);
        when(settlementService.settleMatch(any(), any(), any(), any(), any(), any(), any(), any(), any(),
                eq(10), any(), eq("FILLED"))).thenReturn(MatchOutcome.matched());

        OrderBookMatcher.Result result = matcher.match(incoming, incomingAccount, INSTRUMENT);

        assertEquals(10, result.totalMatched());
        assertEquals(new BigDecimal("119.50"), result.lastExecutionPrice());
        // Price improvement: executes at the resting order's own price, not the incoming order's limit.
        // 0% fee, same currency -> cash delta is exactly price * quantity on both sides.
        verify(settlementService).settleMatch(eq(resting), eq(restingAccount), any(), eq(new BigDecimal("1195.00")), any(),
                eq(incoming), eq(incomingAccount), any(), eq(new BigDecimal("1195.00")),
                eq(10), eq(new BigDecimal("119.50")), eq("FILLED"));
        // The resting side gets its own trade-events publish too, not just the incoming order.
        verify(tradeEventPublisher).publishFilled(eq(resting), eq(new BigDecimal("119.50")), any());
    }

    @Test
    void partiallyMatchesWhenRestingQuantityIsSmallerAndLeavesTheRemainderResting() {
        OrderRow incoming = order(INCOMING_ID, 1L, "SELL", 5, new BigDecimal("120.00"), 0);
        OrderRow resting = order(UUID.randomUUID(), 2L, "BUY", 3, new BigDecimal("120.00"), 0);
        AccountRow incomingAccount = account(1L);
        AccountRow restingAccount = account(2L);

        // First query finds the resting order; once it's fully consumed a
        // real re-query would no longer return it (its status moves past
        // NEW/PARTIALLY_FILLED's WHERE clause) - the second call simulates
        // that by coming back empty, which is what actually stops the walk.
        when(orderMapper.findRestingOpposite(INSTRUMENT_ID, "BUY", incoming.limitPrice(), INCOMING_ID))
                .thenReturn(List.of(resting), List.of());
        givenRestingAccountIsUsable(resting, restingAccount);
        when(settlementService.settleMatch(any(), any(), any(), any(), any(), any(), any(), any(), any(),
                eq(3), any(), eq("FILLED"))).thenReturn(MatchOutcome.matched());

        OrderBookMatcher.Result result = matcher.match(incoming, incomingAccount, INSTRUMENT);

        // Only 3 of the incoming order's 5 shares found a counterparty - the
        // other 2 rest, which is what OrderExecutionService turns into
        // PARTIALLY_FILLED rather than FILLED.
        assertEquals(3, result.totalMatched());
        // Resting order's own 3-of-3 quantity fully consumes it (filled 0 -> 3 of 3).
        verify(tradeEventPublisher).publishFilled(eq(resting), eq(new BigDecimal("120.00")), any());
    }

    @Test
    void noCrossingResultsInNoMatchAndNoSettlementCall() {
        OrderRow incoming = order(INCOMING_ID, 1L, "BUY", 10, new BigDecimal("100.00"), 0);
        AccountRow incomingAccount = account(1L);

        when(orderMapper.findRestingOpposite(INSTRUMENT_ID, "SELL", incoming.limitPrice(), INCOMING_ID))
                .thenReturn(List.of());

        OrderBookMatcher.Result result = matcher.match(incoming, incomingAccount, INSTRUMENT);

        assertEquals(0, result.totalMatched());
        assertNull(result.lastExecutionPrice());
        verify(settlementService, never()).settleMatch(any(), any(), any(), any(), any(), any(), any(), any(), any(), anyInt(), any(), any());
    }

    @Test
    void contendedRestingOrderIsSkippedInFavourOfTheNextCandidate() {
        OrderRow incoming = order(INCOMING_ID, 1L, "BUY", 10, new BigDecimal("120.00"), 0);
        OrderRow contended = order(UUID.randomUUID(), 2L, "SELL", 10, new BigDecimal("119.00"), 0);
        OrderRow next = order(UUID.randomUUID(), 3L, "SELL", 10, new BigDecimal("119.50"), 0);
        AccountRow incomingAccount = account(1L);
        AccountRow contendedAccount = account(2L);
        AccountRow nextAccount = account(3L);

        // Both candidates come back in the same pass - contended is tried
        // first (better price), fails, and the walk moves on to next
        // within the same pass rather than re-querying immediately.
        when(orderMapper.findRestingOpposite(INSTRUMENT_ID, "SELL", incoming.limitPrice(), INCOMING_ID))
                .thenReturn(List.of(contended, next));
        givenRestingAccountIsUsable(contended, contendedAccount);
        givenRestingAccountIsUsable(next, nextAccount);
        when(settlementService.settleMatch(eq(contended), any(), any(), any(), any(), any(), any(), any(), any(),
                anyInt(), any(), any())).thenReturn(MatchOutcome.contended());
        when(settlementService.settleMatch(eq(next), any(), any(), any(), any(), any(), any(), any(), any(),
                anyInt(), any(), any())).thenReturn(MatchOutcome.matched());

        OrderBookMatcher.Result result = matcher.match(incoming, incomingAccount, INSTRUMENT);

        assertEquals(10, result.totalMatched());
        assertEquals(new BigDecimal("119.50"), result.lastExecutionPrice());
        verify(settlementService, times(1)).settleMatch(eq(contended), any(), any(), any(), any(), any(), any(), any(), any(), anyInt(), any(), any());
        verify(settlementService, times(1)).settleMatch(eq(next), any(), any(), any(), any(), any(), any(), any(), any(), anyInt(), any(), any());
        // Contention means nothing committed for that candidate - no publish either.
        verify(tradeEventPublisher, never()).publishFilled(eq(contended), any(), any());
        verify(tradeEventPublisher).publishFilled(eq(next), any(), any());
    }

    @Test
    void restingOrderThatCanNoLongerBeHonouredIsSkippedInFavourOfTheNextCandidate() {
        OrderRow incoming = order(INCOMING_ID, 1L, "BUY", 5, new BigDecimal("120.00"), 0);
        OrderRow poorSeller = order(UUID.randomUUID(), 2L, "SELL", 5, new BigDecimal("119.00"), 0);
        OrderRow ableSeller = order(UUID.randomUUID(), 3L, "SELL", 5, new BigDecimal("119.50"), 0);
        AccountRow incomingAccount = account(1L);
        AccountRow poorSellerAccount = account(2L);
        AccountRow ableSellerAccount = account(3L);

        when(orderMapper.findRestingOpposite(INSTRUMENT_ID, "SELL", incoming.limitPrice(), INCOMING_ID))
                .thenReturn(List.of(poorSeller, ableSeller));
        when(accountMapper.findById(poorSeller.accountId())).thenReturn(Optional.of(poorSellerAccount));
        // Poor seller holds nothing - checkHoldingsSufficient(0, 5) fails.
        when(positionMapper.findHeldQuantity(poorSellerAccount.accountUuid(), INSTRUMENT_ID)).thenReturn(0L);
        givenRestingAccountIsUsable(ableSeller, ableSellerAccount);
        when(settlementService.settleMatch(eq(ableSeller), any(), any(), any(), any(), any(), any(), any(), any(),
                anyInt(), any(), any())).thenReturn(MatchOutcome.matched());

        OrderBookMatcher.Result result = matcher.match(incoming, incomingAccount, INSTRUMENT);

        assertEquals(5, result.totalMatched());
        assertEquals(new BigDecimal("119.50"), result.lastExecutionPrice());
        verify(settlementService, never()).settleMatch(eq(poorSeller), any(), any(), any(), any(), any(), any(), any(), any(), anyInt(), any(), any());
    }
}
