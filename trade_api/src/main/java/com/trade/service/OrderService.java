package com.trade.service;

import com.trade.domain.Order;
import com.trade.domain.OrderLogic;
import com.trade.dto.OrderResponseDto;
import com.trade.dto.OrderReviewRequestDto;
import com.trade.dto.OrderReviewResponseDto;
import com.trade.dto.PlaceOrderRequestDto;
import com.trade.enums.OrderSide;
import com.trade.enums.OrderStatus;
import com.trade.exception.AccountNotFoundException;
import com.trade.exception.ConcurrentUpdateException;
import com.trade.exception.DomainException;
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
import com.trade.service.currency.CurrencyConversion;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;

@Service
public class OrderService {

    private final AccountMapper accountMapper;
    private final InstrumentMapper instrumentMapper;
    private final OrderMapper orderMapper;
    private final OrderLogic orderLogic;
    private final AccountAccessGuard accessGuard;
    // The commission rate (LEAP-017). Only trade_api holds it: it is written on
    // every order, and trade_executor charges each fill at the order's own rate.
    private final BigDecimal feeRate;

    public OrderService(AccountMapper accountMapper, InstrumentMapper instrumentMapper,
                        OrderMapper orderMapper, OrderLogic orderLogic, AccountAccessGuard accessGuard,
                        @Value("${fee.rate}") BigDecimal feeRate) {
        this.accountMapper = accountMapper;
        this.instrumentMapper = instrumentMapper;
        this.orderMapper = orderMapper;
        this.orderLogic = orderLogic;
        this.accessGuard = accessGuard;
        this.feeRate = feeRate;
    }

    //service must roll back on every failure after the balance write
    //need this for checked exceptions + status is defaulted to NEW
    @Transactional(rollbackFor = Exception.class)
    public OrderResponseDto placeOrder(PlaceOrderRequestDto request, Long callerAccountId) throws DomainException {
        accessGuard.requireTokenMatches(request.accountId(), callerAccountId);

        // The same symbol however it was typed, as the review step reads it ("aapl " is AAPL).
        String symbol = request.symbol().trim().toUpperCase(java.util.Locale.ROOT);
        Order order = new Order();
        order.setAccountId(request.accountId());
        order.setSymbol(symbol);
        order.setSide(request.side());
        order.setQuantity(request.quantity());
        order.setPrice(request.price());
        order.setIdempotencyKey(request.idempotencyKey());
        //rule 1 to 8 is being applied, fails at first conflict
        orderLogic.evaluate(order);

        AccountRow account = accountMapper.findById(request.accountId())
                .orElseThrow(() -> new IllegalStateException(
                        "Account " + request.accountId() + " passed evaluation but is missing at write time"));
        InstrumentRow instrument = instrumentMapper.findBySymbol(symbol)
                .orElseThrow(() -> new IllegalStateException(
                        "Instrument " + symbol + " passed evaluation but is missing at write time"));
        // Both sides: a SELL needs the rate too, to settle its proceeds, and
        // the executor only has the rates this service puts on ORDER_PLACED.
        requireConvertible(instrument, account);

        if (order.getSide() == OrderSide.BUY) {
            BigDecimal instrumentValue = order.getPrice().multiply(BigDecimal.valueOf(order.getQuantity()));
            BigDecimal accountValue = CurrencyConversion.convert(
                    instrumentValue, instrument.quoteCurrency(), account.currency());
            BigDecimal fee = CurrencyConversion.money(accountValue.multiply(feeRate));
            BigDecimal required = CurrencyConversion.money(accountValue.add(fee));
            if (account.cashBalance().compareTo(required) < 0) {
                throw new InsufficientFundsException(required, account.cashBalance());
            }
        }

        // pricing is done in executor
        // order persists as new until transaction is done and order is published
        UUID orderId = UUID.randomUUID();
        try {
            orderMapper.insertOrder(
                    orderId, account.userId(), account.accountUuid(), instrument.instrumentId(),
                    order.getSide().name(), order.getQuantity(), order.getPrice(), order.getExecutedPrice(),
                    order.getStatus().name(), order.getIdempotencyKey(), feeRate);
        } catch (DataIntegrityViolationException e) {
            throw new DuplicateOrderException(order.getIdempotencyKey());
        }

        return new OrderResponseDto(
                "ORD-" + orderId,
                order.getStatus(),
                "Order placed",
                order.getSymbol(),
                order.getSide(),
                order.getQuantity(),
                order.getPrice());
    }

    // The review step (LEAP-017): what the order will cost at its limit price,
    // with the fee at the rate placeOrder would write on it. Reads only; it
    // saves and publishes nothing. The executor may fill at a better price, so
    // for a BUY these figures are an upper bound.
    public OrderReviewResponseDto reviewOrder(OrderReviewRequestDto request, Long callerAccountId)
            throws DomainException {
        accessGuard.requireTokenMatches(request.accountId(), callerAccountId);
        AccountRow account = accountMapper.findById(request.accountId())
                .orElseThrow(() -> new AccountNotFoundException(request.accountId()));
        accessGuard.requireActiveAndMatches(account, callerAccountId);

        String symbol = request.symbol().trim().toUpperCase();
        InstrumentRow instrument = instrumentMapper.findBySymbol(symbol)
                .filter(i -> Boolean.TRUE.equals(i.tradable()))
                .orElseThrow(() -> new InstrumentNotFoundException(symbol));
        requireConvertible(instrument, account);

        BigDecimal cost = request.price().multiply(BigDecimal.valueOf(request.quantity()));
        BigDecimal fee = cost.multiply(feeRate).setScale(2, RoundingMode.HALF_UP);
        boolean buy = request.side() == OrderSide.BUY;
        BigDecimal total = buy ? cost.add(fee) : cost.subtract(fee);
        BigDecimal convertedAccountValue = CurrencyConversion.convert(
                cost, instrument.quoteCurrency(), account.currency());
        BigDecimal accountCost = CurrencyConversion.money(convertedAccountValue);
        BigDecimal accountFee = CurrencyConversion.money(convertedAccountValue.multiply(feeRate));
        BigDecimal accountTotal = CurrencyConversion.money(buy
                ? convertedAccountValue.add(accountFee) : convertedAccountValue.subtract(accountFee));
        BigDecimal cashRemaining = buy ? account.cashBalance().subtract(accountTotal) : null;

        return new OrderReviewResponseDto(
                symbol, request.side(), request.quantity(), request.price(),
                instrument.quoteCurrency(), cost, feeRate, fee, total,
                accountCost, accountFee, accountTotal,
                account.cashBalance(), account.currency(), cashRemaining);
    }

    public java.util.Map<String, BigDecimal> instrumentToAccountRates(String symbol) throws DomainException {
        String normalized = symbol.trim().toUpperCase();
        InstrumentRow instrument = instrumentMapper.findBySymbol(normalized)
                .orElseThrow(() -> new InstrumentNotFoundException(normalized));
        return CurrencyConversion.ratesForInstrument(instrument.quoteCurrency());
    }

    private static void requireConvertible(InstrumentRow instrument, AccountRow account)
            throws UnsupportedCurrencyException {
        if (!CurrencyConversion.isSupported(instrument.quoteCurrency(), account.currency())) {
            throw new UnsupportedCurrencyException(instrument.quoteCurrency(), account.currency());
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public OrderResponseDto cancelOrder(UUID orderId, Long callerAccountId) throws DomainException {
        OrderRow order = orderMapper.findByOrderId(orderId)
                .orElseThrow(() -> new OrderNotFoundException(orderId.toString()));

        AccountRow account = accountMapper.findById(order.accountId())
                .orElseThrow(() -> new IllegalStateException(
                        "Order " + orderId + " references missing account " + order.accountId()));
        accessGuard.requireActiveAndMatches(account, callerAccountId);

        //new orders move to cancelled if zero rows are affected
        int affected = orderMapper.cancelIfNew(orderId);
        if (affected == 0) {
            throw new OrderNotCancellableException(orderId.toString(), OrderStatus.valueOf(order.status()));
        }

        return new OrderResponseDto(
                "ORD-" + orderId,
                OrderStatus.CANCELLED,
                "Order cancelled",
                order.symbol(),
                OrderSide.valueOf(order.side()),
                order.quantity(),
                order.price());
    }
}
