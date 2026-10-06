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
import com.trade.exception.OrderNotCancellableException;
import com.trade.exception.OrderNotFoundException;
import com.trade.mapper.AccountMapper;
import com.trade.mapper.AccountRow;
import com.trade.mapper.InstrumentMapper;
import com.trade.mapper.InstrumentRow;
import com.trade.mapper.OrderMapper;
import com.trade.mapper.OrderRow;
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

        Order order = new Order();
        order.setAccountId(request.accountId());
        order.setSymbol(request.symbol());
        order.setSide(request.side());
        order.setQuantity(request.quantity());
        order.setPrice(request.price());
        order.setIdempotencyKey(request.idempotencyKey());
        //rule 1 to 8 is being applied, fails at first conflict
        orderLogic.evaluate(order);

        AccountRow account = accountMapper.findById(request.accountId())
                .orElseThrow(() -> new IllegalStateException(
                        "Account " + request.accountId() + " passed evaluation but is missing at write time"));
        InstrumentRow instrument = instrumentMapper.findBySymbol(request.symbol())
                .orElseThrow(() -> new IllegalStateException(
                        "Instrument " + request.symbol() + " passed evaluation but is missing at write time"));

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

        BigDecimal cost = request.price().multiply(BigDecimal.valueOf(request.quantity()));
        BigDecimal fee = cost.multiply(feeRate).setScale(2, RoundingMode.HALF_UP);
        boolean buy = request.side() == OrderSide.BUY;
        BigDecimal total = buy ? cost.add(fee) : cost.subtract(fee);
        boolean sameCurrency = instrument.quoteCurrency().equals(account.currency());
        BigDecimal cashRemaining = buy && sameCurrency ? account.cashBalance().subtract(total) : null;

        return new OrderReviewResponseDto(
                symbol, request.side(), request.quantity(), request.price(),
                instrument.quoteCurrency(), cost, feeRate, fee, total,
                account.cashBalance(), account.currency(), cashRemaining);
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
