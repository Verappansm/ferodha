package com.trade.service;

import com.trade.domain.AccountRepository;
import com.trade.domain.IdempotencyKeyStore;
import com.trade.domain.InstrumentRepository;
import com.trade.domain.OrderLogic;
import com.trade.domain.Position;
import com.trade.domain.PositionRepository;
import com.trade.dto.OrderResponseDto;
import com.trade.dto.OrderReviewRequestDto;
import com.trade.dto.OrderReviewResponseDto;
import com.trade.dto.PlaceOrderRequestDto;
import com.trade.enums.AccountStatus;
import com.trade.enums.OrderSide;
import com.trade.enums.OrderStatus;
import com.trade.exception.AccountNotActiveException;
import com.trade.exception.DuplicateOrderException;
import com.trade.exception.InstrumentNotFoundException;
import com.trade.exception.InsufficientFundsException;
import com.trade.exception.OrderNotCancellableException;
import com.trade.exception.OrderNotFoundException;
import com.trade.exception.UnsupportedCurrencyException;
import com.trade.mapper.AccountMapper;
import com.trade.mapper.AccountRow;
import com.trade.mapper.InstrumentMapper;
import com.trade.mapper.InstrumentRow;
import com.trade.mapper.OrderMapper;
import com.trade.mapper.OrderRow;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// OrderService orchestrates writes around the already-tested OrderLogic
// rules (see OrderLogicTest in java_module), so this only tests what this
// class itself is responsible for: resolving DTOs, translating a constraint
// violation into the right domain exception, and the cancel state
// transition. Since Sprint 7's Story 3 (Trade REST API Publishes
// ORDER_PLACED and Answers NEW), placeOrder no longer fills synchronously -
// there is no price in the placement request, pricing is the executor's
// job - so it never touches the account balance or writes a Trade row; it
// only ever writes the Orders row at NEW. The "concurrent update on the
// account" scenario this file used to pin no longer exists as a placeOrder
// code path (ConcurrentUpdateException is no longer thrown from here) and
// was removed rather than left pinning dead code.
class OrderServiceTest {

    private static final UUID ACCOUNT_UUID = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static final UUID USER_UUID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID INSTRUMENT_UUID = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static final BigDecimal FEE_RATE = new BigDecimal("0.001");

    private final AccountMapper accountMapper = mock(AccountMapper.class);
    private final InstrumentMapper instrumentMapper = mock(InstrumentMapper.class);
    private final OrderMapper orderMapper = mock(OrderMapper.class);

    // OrderLogic itself is the frozen Sprint 5 domain class - it is
    // constructed for real, backed by adapters over the same mocked mappers,
    // rather than mocked, so this test exercises the real seam Sprint 6 was
    // built against.
    private OrderService orderService;

    @BeforeEach
    void setUp() {
        AccountRepository accountRepository = new AccountRepositoryImpl(accountMapper);
        InstrumentRepository instrumentRepository = new InstrumentRepositoryImpl(instrumentMapper);
        PositionRepository positionRepository = (accountId, symbol) -> Optional.empty();
        IdempotencyKeyStore idempotencyKeyStore = new IdempotencyKeyStoreImpl(orderMapper);
        OrderLogic orderLogic = new OrderLogic(accountRepository, instrumentRepository, positionRepository, idempotencyKeyStore);

        orderService = new OrderService(accountMapper, instrumentMapper, orderMapper, orderLogic,
                new AccountAccessGuard(), FEE_RATE);
    }

    @Test
    @DisplayName("An accepted order is written at NEW and answered NEW, with no cash or trade write at placement time")
    void placeOrderWritesNewWithoutFillingSynchronously() throws Exception {
        givenActiveAccount(new BigDecimal("5000.00"), 0);
        givenTradableInstrument();
        when(orderMapper.existsIdempotencyKey("KEY-1")).thenReturn(false);
        when(orderMapper.insertOrder(any(), any(), any(), any(), any(), anyInt(), any(), any(), any(), any(), any()))
                .thenReturn(1);

        OrderResponseDto response = orderService.placeOrder(validRequest(), 1L);

        assertEquals(OrderStatus.NEW, response.status());
        verify(orderMapper, times(1)).insertOrder(any(), any(), any(), any(), any(), anyInt(), any(), any(), any(), any(),
                eq(FEE_RATE));
        verify(accountMapper, never()).updateBalanceWithVersion(anyLong(), any(), anyInt());
        verify(orderMapper, never()).insertTrade(any(), any(), anyInt());
    }

    @Test
    @DisplayName("A rule failure (insufficient funds) writes nothing")
    void ruleFailureWritesNothing() {
        givenActiveAccount(new BigDecimal("10.00"), 0);
        givenTradableInstrument();

        assertThrows(InsufficientFundsException.class, () -> orderService.placeOrder(validRequest(), 1L));

        verify(accountMapper, never()).updateBalanceWithVersion(anyLong(), any(), anyInt());
        verify(orderMapper, never()).insertOrder(any(), any(), any(), any(), any(), anyInt(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("A reused idempotency key that races past the fast-path check is refused via the unique constraint")
    void duplicateKeyDetectedAtInsertIsTranslated() {
        givenActiveAccount(new BigDecimal("5000.00"), 0);
        givenTradableInstrument();
        // isUsed() sees the key as free (this is the race), but the insert
        // still hits the UNIQUE constraint - that is the actual guard.
        when(orderMapper.existsIdempotencyKey("KEY-1")).thenReturn(false);
        when(orderMapper.insertOrder(any(), any(), any(), any(), any(), anyInt(), any(), any(), any(), any(), any()))
                .thenThrow(new DataIntegrityViolationException("duplicate key"));

        assertThrows(DuplicateOrderException.class, () -> orderService.placeOrder(validRequest(), 1L));
    }

    @Test
    @DisplayName("A token whose accountId does not match the order's accountId is ACC-403, before any rule runs")
    void tokenMismatchIsRefusedBeforeEvaluation() {
        assertThrows(AccountNotActiveException.class, () -> orderService.placeOrder(validRequest(), 2L));

        verify(accountMapper, never()).findById(anyLong());
    }

    @Test
    @DisplayName("Cancelling an order that does not exist returns ORD-409 at 404")
    void cancellingUnknownOrderIsNotFound() {
        UUID orderId = UUID.randomUUID();
        when(orderMapper.findByOrderId(orderId)).thenReturn(Optional.empty());

        assertThrows(OrderNotFoundException.class, () -> orderService.cancelOrder(orderId, 1L));
    }

    @Test
    @DisplayName("Cancelling an already-FILLED order returns ORD-409 at 409")
    void cancellingFilledOrderIsRefused() {
        UUID orderId = UUID.randomUUID();
        givenActiveAccount(new BigDecimal("5000.00"), 0);
        when(orderMapper.findByOrderId(orderId)).thenReturn(Optional.of(
                new OrderRow(orderId, 1L, "AAPL", "BUY", 10, new BigDecimal("100.00"),
                        new BigDecimal("100.00"), "FILLED")));
        when(orderMapper.cancelIfNew(orderId)).thenReturn(0);

        assertThrows(OrderNotCancellableException.class, () -> orderService.cancelOrder(orderId, 1L));
    }

    @Test
    @DisplayName("Cancelling a NEW order the caller's token reaches succeeds")
    void cancellingNewOrderSucceeds() throws Exception {
        UUID orderId = UUID.randomUUID();
        givenActiveAccount(new BigDecimal("5000.00"), 0);
        when(orderMapper.findByOrderId(orderId)).thenReturn(Optional.of(
                new OrderRow(orderId, 1L, "AAPL", "BUY", 10, new BigDecimal("100.00"), null, "NEW")));
        when(orderMapper.cancelIfNew(orderId)).thenReturn(1);

        OrderResponseDto response = orderService.cancelOrder(orderId, 1L);

        assertEquals(OrderStatus.CANCELLED, response.status());
    }

    @Test
    @DisplayName("A BUY review is quantity x price plus the fee, and the cash left after it; nothing is written")
    void reviewOfABuy() throws Exception {
        givenActiveAccount(new BigDecimal("5000.00"), 0);
        givenTradableInstrument();

        OrderReviewResponseDto review = orderService.reviewOrder(reviewRequest(OrderSide.BUY), 1L);

        assertEquals(0, new BigDecimal("2000.00").compareTo(review.estimatedCost()));
        assertEquals(0, FEE_RATE.compareTo(review.feeRate()));
        assertEquals(0, new BigDecimal("2.00").compareTo(review.fee()));
        assertEquals(0, new BigDecimal("2002.00").compareTo(review.total()));
        assertEquals(0, new BigDecimal("2998.00").compareTo(review.cashRemaining()));
        assertEquals("USD", review.currency());
        verify(orderMapper, never()).insertOrder(any(), any(), any(), any(), any(), anyInt(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("A SELL review is the value less the fee, with no cash-remaining figure")
    void reviewOfASell() throws Exception {
        givenActiveAccount(new BigDecimal("5000.00"), 0);
        givenTradableInstrument();

        OrderReviewResponseDto review = orderService.reviewOrder(reviewRequest(OrderSide.SELL), 1L);

        assertEquals(0, new BigDecimal("1998.00").compareTo(review.total()));
        assertNull(review.cashRemaining());
    }

    @Test
    @DisplayName("Cross-currency review converts the total and cash remaining into the account currency")
    void reviewAcrossCurrencies() throws Exception {
        when(accountMapper.findById(1L)).thenReturn(Optional.of(new AccountRow(
                1L, ACCOUNT_UUID, "ACC-000001", USER_UUID, "Test Holder", new BigDecimal("500000.00"),
                AccountStatus.ACTIVE.name(), 0, OffsetDateTime.now(), "INR")));
        givenTradableInstrument();

        OrderReviewResponseDto review = orderService.reviewOrder(reviewRequest(OrderSide.BUY), 1L);

        assertEquals("USD", review.currency());
        assertEquals("INR", review.accountCurrency());
        assertEquals(0, new BigDecimal("180000.00").compareTo(review.estimatedCostAccountCurrency()));
        assertEquals(0, new BigDecimal("180.00").compareTo(review.feeAccountCurrency()));
        assertEquals(0, new BigDecimal("180180.00").compareTo(review.totalAccountCurrency()));
        assertEquals(0, new BigDecimal("319820.00").compareTo(review.cashRemaining()));
    }

    @Test
    @DisplayName("A SELL from an account in a currency with no fixed rate is FX-422 and writes nothing")
    void sellFromUnsupportedCurrencyIsRefused() {
        givenAccountInCurrency("EUR");
        givenTradableInstrument();
        // Holds the shares, so the SELL passes OrderLogic and reaches the currency check.
        OrderLogic holdingLogic = new OrderLogic(new AccountRepositoryImpl(accountMapper),
                new InstrumentRepositoryImpl(instrumentMapper),
                (accountId, symbol) -> Optional.of(new Position(accountId, symbol, 100L, new BigDecimal("90.00"))),
                new IdempotencyKeyStoreImpl(orderMapper));
        OrderService service = new OrderService(accountMapper, instrumentMapper, orderMapper, holdingLogic,
                new AccountAccessGuard(), FEE_RATE);
        PlaceOrderRequestDto sell = new PlaceOrderRequestDto(1L, "AAPL", OrderSide.SELL, 20, new BigDecimal("100.00"), "KEY-1");

        assertThrows(UnsupportedCurrencyException.class, () -> service.placeOrder(sell, 1L));
        verify(orderMapper, never()).insertOrder(any(), any(), any(), any(), any(), anyInt(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("Reviewing an order in a currency with no fixed rate is FX-422, not a 500")
    void reviewInUnsupportedCurrencyIsRefused() {
        givenAccountInCurrency("EUR");
        givenTradableInstrument();

        assertThrows(UnsupportedCurrencyException.class, () -> orderService.reviewOrder(reviewRequest(OrderSide.BUY), 1L));
    }

    @Test
    @DisplayName("Reviewing an order for another account is ACC-403")
    void reviewOfAnotherAccountIsRefused() {
        assertThrows(AccountNotActiveException.class, () -> orderService.reviewOrder(reviewRequest(OrderSide.BUY), 2L));
        verify(accountMapper, never()).findById(anyLong());
    }

    @Test
    @DisplayName("Reviewing a delisted instrument is INS-404")
    void reviewOfADelistedInstrument() {
        givenActiveAccount(new BigDecimal("5000.00"), 0);
        when(instrumentMapper.findBySymbol("AAPL")).thenReturn(Optional.of(
                new InstrumentRow(INSTRUMENT_UUID, "AAPL", "Apple Inc.", "EQUITY", "USD", false, "NASDAQ", "Technology")));

        assertThrows(InstrumentNotFoundException.class, () -> orderService.reviewOrder(reviewRequest(OrderSide.BUY), 1L));
    }

    private OrderReviewRequestDto reviewRequest(OrderSide side) {
        return new OrderReviewRequestDto(1L, "AAPL", side, 20, new BigDecimal("100.00"));
    }

    private void givenActiveAccount(BigDecimal balance, int version) {
        when(accountMapper.findById(1L)).thenReturn(Optional.of(new AccountRow(
                1L, ACCOUNT_UUID, "ACC-000001", USER_UUID, "Test Holder", balance,
                AccountStatus.ACTIVE.name(), version, OffsetDateTime.now(), "USD")));
    }

    private void givenAccountInCurrency(String currency) {
        when(accountMapper.findById(1L)).thenReturn(Optional.of(new AccountRow(
                1L, ACCOUNT_UUID, "ACC-000001", USER_UUID, "Test Holder", new BigDecimal("5000.00"),
                AccountStatus.ACTIVE.name(), 0, OffsetDateTime.now(), currency)));
    }

    private void givenTradableInstrument() {
        when(instrumentMapper.findBySymbol("AAPL")).thenReturn(Optional.of(
                new InstrumentRow(INSTRUMENT_UUID, "AAPL", "Apple Inc.", "EQUITY", "USD", true, "NASDAQ", "Technology")));
    }

    private PlaceOrderRequestDto validRequest() {
        return new PlaceOrderRequestDto(1L, "AAPL", OrderSide.BUY, 20, new BigDecimal("100.00"), "KEY-1");
    }
}
