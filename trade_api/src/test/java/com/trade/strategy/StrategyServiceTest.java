package com.trade.strategy;

import com.trade.enums.OrderSide;
import com.trade.exception.DomainException;
import com.trade.exception.InvalidParameterException;
import com.trade.exception.StrategyNotFoundException;
import com.trade.exception.StrategyStateException;
import com.trade.mapper.AccountMapper;
import com.trade.mapper.AccountRow;
import com.trade.mapper.InstrumentMapper;
import com.trade.mapper.InstrumentRow;
import com.trade.mapper.PositionMapper;
import com.trade.mapper.PositionRow;
import com.trade.exception.InsufficientHoldingsException;
import com.trade.service.AccountAccessGuard;
import com.trade.service.OrderService;
import com.trade.strategy.StrategyDtos.CreateStrategyRequest;
import com.trade.strategy.mapper.StrategyMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class StrategyServiceTest {

    private static final String ID = "11111111-1111-1111-1111-111111111111";
    private static final String USER = "22222222-2222-2222-2222-222222222222";

    private final StrategyMapper mapper = mock(StrategyMapper.class);
    private final AccountMapper accounts = mock(AccountMapper.class);
    private final InstrumentMapper instruments = mock(InstrumentMapper.class);
    private final PositionMapper positions = mock(PositionMapper.class);
    private final OrderService orders = mock(OrderService.class);
    private StrategyService service;

    @BeforeEach
    void setUp() {
        service = new StrategyService(mapper, accounts, instruments, positions, new AccountAccessGuard(), orders,
                new BigDecimal("0.001"));
        when(accounts.findById(1L)).thenReturn(Optional.of(new AccountRow(1L, UUID.randomUUID(), "ACC-1",
                UUID.randomUUID(), "John", new BigDecimal("50000"), "ACTIVE", 0, null, "USD")));
        when(instruments.findBySymbol("AAPL")).thenReturn(Optional.of(new InstrumentRow(UUID.randomUUID(),
                "AAPL", "Apple", "EQUITY", "USD", true, "NASDAQ", "Tech")));
        when(mapper.findById(ID)).thenReturn(strategy(1L, "DISABLED"));
        when(mapper.insert(anyString(), anyLong(), anyString(), anyString(), anyString(), any(), anyInt(), any(),
                any(), anyInt(), anyInt(), org.mockito.ArgumentMatchers.anyBoolean(), any())).thenReturn(ID);
    }

    private static Strategy strategy(long accountId, String status) {
        return new Strategy(ID, USER, accountId, "dip", "AAPL", "BUY", new BigDecimal("100.00"), 50,
                new BigDecimal("10000.00"), 100, 1, 3, false, status, 0, 0, null, null, null);
    }

    private static CreateStrategyRequest buy(String maxSpend, Integer maxPosition) {
        return new CreateStrategyRequest("dip", "aapl", OrderSide.BUY, new BigDecimal("100.00"), 50,
                maxSpend == null ? null : new BigDecimal(maxSpend), maxPosition, null, null, null, null);
    }

    @Test
    @DisplayName("A strategy is created disabled, for the caller's own account")
    void createsDisabled() throws DomainException {
        service.create(buy("10000.00", 100), USER, 1L);
        verify(mapper).insert(eq(USER), eq(1L), eq("dip"), eq("AAPL"), eq("BUY"), any(), eq(50), any(), eq(100),
                eq(1), eq(3), eq(false), any());
        verify(mapper).insertEvent(ID, "CREATED", "Created disabled");
    }

    @Test
    @DisplayName("A BUY must carry caps that fit at least one order, fee included")
    void buyNeedsSensibleCaps() {
        assertThrows(InvalidParameterException.class, () -> service.create(buy(null, 100), USER, 1L));
        assertThrows(InvalidParameterException.class, () -> service.create(buy("5000.00", 100), USER, 1L));
        assertThrows(InvalidParameterException.class, () -> service.create(buy("10000.00", 10), USER, 1L));
        assertThrows(InvalidParameterException.class, () -> service.create(buy("10000.00", null), USER, 1L));
    }

    private static CreateStrategyRequest sell() {
        return new CreateStrategyRequest("exit", "AAPL", OrderSide.SELL, new BigDecimal("120.00"), 50,
                null, null, null, null, null, null);
    }

    @Test
    @DisplayName("A SELL strategy needs the stock in the account: no stock, no sell")
    void sellNeedsHoldings() {
        when(positions.find(1L, "AAPL")).thenReturn(Optional.empty());
        assertThrows(InsufficientHoldingsException.class, () -> service.create(sell(), USER, 1L));
        when(positions.find(1L, "AAPL")).thenReturn(Optional.of(new PositionRow(1L, "AAPL", 30L, BigDecimal.TEN)));
        assertThrows(InsufficientHoldingsException.class, () -> service.create(sell(), USER, 1L));
    }

    @Test
    @DisplayName("A SELL strategy is created when enough units are held")
    void sellWithHoldingsIsCreated() throws DomainException {
        when(positions.find(1L, "AAPL")).thenReturn(Optional.of(new PositionRow(1L, "AAPL", 80L, BigDecimal.TEN)));
        service.create(sell(), USER, 1L);
        verify(mapper).insert(eq(USER), eq(1L), eq("exit"), eq("AAPL"), eq("SELL"), any(), eq(50), any(), any(),
                eq(1), eq(3), eq(false), any());
    }

    @Test
    @DisplayName("Another account's strategy is STR-404, the same as one that does not exist")
    void notYoursIsNotFound() {
        when(mapper.findById(ID)).thenReturn(strategy(2L, "DISABLED"));
        assertThrows(StrategyNotFoundException.class, () -> service.get(ID, 1L));
        assertThrows(StrategyNotFoundException.class, () -> service.enable(ID, 1L));
        assertThrows(StrategyNotFoundException.class, () -> service.get("not-a-uuid", 1L));
    }

    @Test
    @DisplayName("Enabling a strategy that cannot be enabled is STR-409")
    void enableRefusedWhenCompleted() {
        when(mapper.enable(ID)).thenReturn(0);
        assertThrows(StrategyStateException.class, () -> service.enable(ID, 1L));
    }

    @Test
    @DisplayName("Disabling stops the strategy and cancels its working orders")
    void disableCancelsWorkingOrders() throws DomainException {
        String order = "33333333-3333-3333-3333-333333333333";
        when(mapper.disable(ID)).thenReturn(1);
        when(mapper.findOpenOrderIds(ID)).thenReturn(List.of(order));

        service.disable(ID, 1L);

        verify(orders).cancelOrder(UUID.fromString(order), 1L);
        verify(mapper).insertEvent(eq(ID), eq("DISABLED"), org.mockito.ArgumentMatchers.contains("1 working order"));
    }

    @Test
    @DisplayName("Disabling a strategy that is already stopped changes and cancels nothing")
    void disableIsIdempotent() throws DomainException {
        when(mapper.disable(ID)).thenReturn(0);
        assertEquals("DISABLED", service.disable(ID, 1L).status());
        verify(orders, never()).cancelOrder(any(), anyLong());
    }
}
