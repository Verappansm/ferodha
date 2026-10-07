package com.trade.executor.domain;

import com.trade.executor.consumer.PoisonMessageException;
import com.trade.executor.enums.OrderSide;
import com.trade.executor.event.OrderPlacedPayload;
import com.trade.executor.event.TradeEventPublisher;
import com.trade.executor.fauxnance.Quote;
import com.trade.executor.fauxnance.QuoteSource;
import com.trade.executor.fee.FeeCalculator;
import com.trade.executor.mapper.AccountMapper;
import com.trade.executor.mapper.AccountRow;
import com.trade.executor.mapper.InstrumentMapper;
import com.trade.executor.mapper.InstrumentRow;
import com.trade.executor.mapper.OrderMapper;
import com.trade.executor.mapper.OrderRow;
import com.trade.executor.mapper.PositionMapper;
import com.trade.executor.settlement.SettlementOutcome;
import com.trade.executor.settlement.SettlementService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// Exercises the orchestration in OrderExecutionService against mocked
// mappers/collaborators - the exact "Unit Test Execution Paths" wording
// from storeis.txt's Story 1 that isn't covered by FillRuleTest alone.
class OrderExecutionServiceTest {

    private static final UUID ORDER_ID = UUID.randomUUID();
    private static final UUID INSTRUMENT_ID = UUID.randomUUID();
    private static final UUID ACCOUNT_UUID = UUID.randomUUID();

    private final OrderMapper orderMapper = mock(OrderMapper.class);
    private final AccountMapper accountMapper = mock(AccountMapper.class);
    private final InstrumentMapper instrumentMapper = mock(InstrumentMapper.class);
    private final PositionMapper positionMapper = mock(PositionMapper.class);
    private final QuoteSource quoteSource = mock(QuoteSource.class);
    private final SettlementService settlementService = mock(SettlementService.class);
    private final TradeEventPublisher tradeEventPublisher = mock(TradeEventPublisher.class);
    private final FeeCalculator feeCalculator = new FeeCalculator();
    // The rate trade_api writes on a portal order; the executor charges it.
    private static final BigDecimal FEE_RATE = new BigDecimal("0.001");

    private OrderExecutionService orderExecutionService;

    private final OrderBookMatcher orderBookMatcher = mock(OrderBookMatcher.class);

    @BeforeEach
    void setUp() {
        // matchingEnabled=false: every test in this file pins the existing,
        // spec-exact single-quote fill-or-reject path. OrderBookMatcherTest
        // and OrderExecutionServiceMatchingTest cover the matching-enabled
        // branch separately.
        orderExecutionService = new OrderExecutionService(orderMapper, accountMapper, instrumentMapper,
                positionMapper, quoteSource, settlementService, tradeEventPublisher,
                feeCalculator, orderBookMatcher, false);
    }

    @Test
    @DisplayName("an account suspended after acceptance does not trade")
    void suspendedAccountDoesNotTrade() {
        givenOrder(OrderSide.BUY, new BigDecimal("10.00"), 10);
        givenTradableInstrument("USD");
        givenAccount("SUSPENDED", new BigDecimal("5000.00"), "USD");
        when(settlementService.settleReject(any(), eq(RejectionReason.ACCOUNT_NOT_ACTIVE)))
                .thenReturn(SettlementOutcome.rejected(RejectionReason.ACCOUNT_NOT_ACTIVE));

        orderExecutionService.process(placedEvent());

        // The suspension is caught before any Fauxnance call is made.
        verify(quoteSource, never()).fetchQuote(any());
        verify(settlementService).settleReject(any(), eq(RejectionReason.ACCOUNT_NOT_ACTIVE));
        verify(tradeEventPublisher).publishRejected(any(), eq(RejectionReason.ACCOUNT_NOT_ACTIVE));
    }

    @Test
    @DisplayName("an order with no available price is resolved rather than left at NEW")
    void noAvailablePriceIsResolved() {
        givenOrder(OrderSide.BUY, new BigDecimal("10.00"), 10);
        givenTradableInstrument("USD");
        givenAccount("ACTIVE", new BigDecimal("5000.00"), "USD");
        when(quoteSource.fetchQuote("AAPL")).thenReturn(Optional.empty());
        when(settlementService.settleReject(any(), eq(RejectionReason.PRICE_UNAVAILABLE)))
                .thenReturn(SettlementOutcome.rejected(RejectionReason.PRICE_UNAVAILABLE));

        orderExecutionService.process(placedEvent());

        verify(settlementService).settleReject(any(), eq(RejectionReason.PRICE_UNAVAILABLE));
        verify(tradeEventPublisher).publishRejected(any(), eq(RejectionReason.PRICE_UNAVAILABLE));
    }

    @Test
    @DisplayName("a delisted instrument is rejected before any quote is fetched")
    void delistedInstrumentIsRejected() {
        givenOrder(OrderSide.BUY, new BigDecimal("10.00"), 10);
        when(instrumentMapper.findById(INSTRUMENT_ID)).thenReturn(Optional.of(
                new InstrumentRow(INSTRUMENT_ID, "AAPL", "USD", false)));
        givenAccount("ACTIVE", new BigDecimal("5000.00"), "USD");
        when(settlementService.settleReject(any(), eq(RejectionReason.INSTRUMENT_NOT_TRADABLE)))
                .thenReturn(SettlementOutcome.rejected(RejectionReason.INSTRUMENT_NOT_TRADABLE));

        orderExecutionService.process(placedEvent());

        verify(quoteSource, never()).fetchQuote(any());
        verify(settlementService).settleReject(any(), eq(RejectionReason.INSTRUMENT_NOT_TRADABLE));
    }

    @Test
    @DisplayName("a redelivered order already settled by a prior delivery is not republished")
    void alreadyProcessedFillIsNotRepublished() {
        givenOrder(OrderSide.BUY, new BigDecimal("10.00"), 10);
        givenTradableInstrument("USD");
        givenAccount("ACTIVE", new BigDecimal("5000.00"), "USD");
        when(quoteSource.fetchQuote("AAPL")).thenReturn(Optional.of(
                new Quote("AAPL", new BigDecimal("9.00"), new BigDecimal("10.00"), "USD")));
        when(settlementService.settleFill(any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(SettlementOutcome.alreadyProcessed());

        orderExecutionService.process(placedEvent());

        verify(tradeEventPublisher, never()).publishFilled(any(), any(), any());
        verify(tradeEventPublisher, never()).publishRejected(any(), any());
    }

    @Test
    @DisplayName("Story 7: an order id not in Postgres is poison, not retried as transient")
    void unknownOrderIdIsPoison() {
        when(orderMapper.findById(ORDER_ID)).thenReturn(Optional.empty());

        assertThrows(PoisonMessageException.class, () -> orderExecutionService.process(placedEvent()));
    }

    @Test
    @DisplayName("Story 7: an unparseable order id is poison")
    void unparseableOrderIdIsPoison() {
        OrderPlacedPayload badEvent = new OrderPlacedPayload("not-a-valid-order-id", 1L, "AAPL",
                OrderSide.BUY, 10, new BigDecimal("10.00"), "KEY-1", Instant.now(), usdInstrumentRates());

        assertThrows(PoisonMessageException.class, () -> orderExecutionService.process(badEvent));
    }

    private void givenOrder(OrderSide side, BigDecimal limitPrice, int quantity) {
        when(orderMapper.findById(ORDER_ID)).thenReturn(Optional.of(
                new OrderRow(ORDER_ID, 1L, INSTRUMENT_ID, "AAPL", side.name(), quantity, limitPrice, "NEW",
                        0, java.time.OffsetDateTime.now(), FEE_RATE)));
    }

    private void givenTradableInstrument(String currency) {
        when(instrumentMapper.findById(INSTRUMENT_ID)).thenReturn(Optional.of(
                new InstrumentRow(INSTRUMENT_ID, "AAPL", currency, true)));
    }

    private void givenAccount(String status, BigDecimal cashBalance, String currency) {
        when(accountMapper.findById(1L)).thenReturn(Optional.of(
                new AccountRow(1L, ACCOUNT_UUID, cashBalance, status, 0, currency)));
    }

    // Only orderId is actually read from the event by OrderExecutionService
    // - every other authoritative field comes from the OrderRow loaded via
    // orderMapper.findById(...), matching what SettlementService's guarded
    // UPDATE treats as the source of truth.
    private OrderPlacedPayload placedEvent() {
        return new OrderPlacedPayload("ORD-" + ORDER_ID, 1L, "AAPL", OrderSide.BUY, 10,
                new BigDecimal("10.00"), "KEY-1", Instant.now(), usdInstrumentRates());
    }

    private static Map<String, BigDecimal> usdInstrumentRates() {
        return Map.of("USD", BigDecimal.ONE, "INR", new BigDecimal("90"));
    }
}
