package com.trade.service;

import com.trade.domain.AccountRepository;
import com.trade.domain.IdempotencyKeyStore;
import com.trade.domain.InstrumentRepository;
import com.trade.domain.OrderLogic;
import com.trade.domain.PositionRepository;
import com.trade.dto.OrderResponseDto;
import com.trade.dto.PlaceOrderRequestDto;
import com.trade.enums.AccountStatus;
import com.trade.enums.OrderSide;
import com.trade.enums.OrderStatus;
import com.trade.exception.AccountNotActiveException;
import com.trade.exception.ConcurrentUpdateException;
import com.trade.exception.DuplicateOrderException;
import com.trade.exception.InsufficientFundsException;
import com.trade.exception.OrderNotCancellableException;
import com.trade.exception.OrderNotFoundException;
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
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// OrderService orchestrates writes around the already-tested OrderLogic
// rules (see OrderLogicTest in java_module), so this only tests what this
// class itself is responsible for: resolving DTOs, running the optimistic
// lock, translating a lost race or a constraint violation into the right
// domain exception, and the cancel state transition.
class OrderServiceTest {

    private static final UUID ACCOUNT_UUID = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static final UUID USER_UUID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID INSTRUMENT_UUID = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

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

        orderService = new OrderService(accountMapper, instrumentMapper, orderMapper, orderLogic, new AccountAccessGuard());
    }

    @Test
    @DisplayName("Placing an order commits the balance write and the order write together")
    void placeOrderCommitsCashAndOrderTogether() throws Exception {
        givenActiveAccount(new BigDecimal("5000.00"), 0);
        givenTradableInstrument();
        when(orderMapper.existsIdempotencyKey("KEY-1")).thenReturn(false);
        when(accountMapper.updateBalanceWithVersion(eq(1L), any(BigDecimal.class), eq(0))).thenReturn(1);
        when(orderMapper.insertOrder(any(), any(), any(), any(), any(), anyInt(), any(), any(), any(), any()))
                .thenReturn(1);

        OrderResponseDto response = orderService.placeOrder(validRequest(), 1L);

        assertEquals(OrderStatus.FILLED, response.status());
        verify(accountMapper).updateBalanceWithVersion(eq(1L), eq(new BigDecimal("3000.00")), eq(0));
        verify(orderMapper, times(1)).insertOrder(any(), any(), any(), any(), any(), anyInt(), any(), any(), any(), any());
        verify(orderMapper, times(1)).insertTrade(any(), any(), anyInt());
    }

    @Test
    @DisplayName("A rule failure (insufficient funds) writes nothing")
    void ruleFailureWritesNothing() {
        givenActiveAccount(new BigDecimal("10.00"), 0);
        givenTradableInstrument();

        assertThrows(InsufficientFundsException.class, () -> orderService.placeOrder(validRequest(), 1L));

        verify(accountMapper, never()).updateBalanceWithVersion(anyLong(), any(), anyInt());
        verify(orderMapper, never()).insertOrder(any(), any(), any(), any(), any(), anyInt(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("A concurrent write on the account is detected and the order is refused with ORD-409")
    void concurrentUpdateIsRefused() {
        givenActiveAccount(new BigDecimal("5000.00"), 0);
        givenTradableInstrument();
        when(orderMapper.existsIdempotencyKey("KEY-1")).thenReturn(false);
        when(accountMapper.updateBalanceWithVersion(eq(1L), any(BigDecimal.class), eq(0))).thenReturn(0);

        assertThrows(ConcurrentUpdateException.class, () -> orderService.placeOrder(validRequest(), 1L));

        verify(orderMapper, never()).insertOrder(any(), any(), any(), any(), any(), anyInt(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("A reused idempotency key that races past the fast-path check is refused via the unique constraint")
    void duplicateKeyDetectedAtInsertIsTranslated() {
        givenActiveAccount(new BigDecimal("5000.00"), 0);
        givenTradableInstrument();
        // isUsed() sees the key as free (this is the race), but the insert
        // still hits the UNIQUE constraint - that is the actual guard.
        when(orderMapper.existsIdempotencyKey("KEY-1")).thenReturn(false);
        when(accountMapper.updateBalanceWithVersion(eq(1L), any(BigDecimal.class), eq(0))).thenReturn(1);
        when(orderMapper.insertOrder(any(), any(), any(), any(), any(), anyInt(), any(), any(), any(), any()))
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

    private void givenActiveAccount(BigDecimal balance, int version) {
        when(accountMapper.findById(1L)).thenReturn(Optional.of(new AccountRow(
                1L, ACCOUNT_UUID, "ACC-000001", USER_UUID, "Test Holder", balance,
                AccountStatus.ACTIVE.name(), version, OffsetDateTime.now(), "USD")));
    }

    private void givenTradableInstrument() {
        when(instrumentMapper.findBySymbol("AAPL")).thenReturn(Optional.of(
                new InstrumentRow(INSTRUMENT_UUID, "AAPL", "Apple Inc.", "EQUITY", "USD", true)));
    }

    private PlaceOrderRequestDto validRequest() {
        return new PlaceOrderRequestDto(1L, "AAPL", OrderSide.BUY, 20, new BigDecimal("100.00"), "KEY-1");
    }
}
