package com.trade.service;

import com.trade.domain.Order;
import com.trade.domain.OrderLogic;
import com.trade.dto.OrderResponseDto;
import com.trade.dto.PlaceOrderRequestDto;
import com.trade.enums.OrderSide;
import com.trade.enums.OrderStatus;
import com.trade.exception.ConcurrentUpdateException;
import com.trade.exception.DomainException;
import com.trade.exception.DuplicateOrderException;
import com.trade.exception.OrderNotCancellableException;
import com.trade.exception.OrderNotFoundException;
import com.trade.mapper.AccountMapper;
import com.trade.mapper.AccountRow;
import com.trade.mapper.InstrumentMapper;
import com.trade.mapper.InstrumentRow;
import com.trade.mapper.OrderMapper;
import com.trade.mapper.OrderRow;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.UUID;

// Order placement and cancellation: the two operations that write, and the
// only two that need a transaction. Everything either method decides about
// whether an order IS allowed lives in OrderLogic; this class owns only
// transport-and-persistence concerns - resolving DTOs to domain calls,
// running the write inside one transaction, and turning a domain exception
// or a lost optimistic-lock race into the response contract fixes.
@Service
public class OrderService {

    private final AccountMapper accountMapper;
    private final InstrumentMapper instrumentMapper;
    private final OrderMapper orderMapper;
    private final OrderLogic orderLogic;
    private final AccountAccessGuard accessGuard;

    public OrderService(AccountMapper accountMapper, InstrumentMapper instrumentMapper,
                         OrderMapper orderMapper, OrderLogic orderLogic, AccountAccessGuard accessGuard) {
        this.accountMapper = accountMapper;
        this.instrumentMapper = instrumentMapper;
        this.orderMapper = orderMapper;
        this.orderLogic = orderLogic;
        this.accessGuard = accessGuard;
    }

    // rollbackFor = Exception.class because DomainException is checked, and
    // Spring's default rollback rule only covers unchecked exceptions - this
    // service must roll back on every failure, including a domain rule
    // firing, or a lost optimistic-lock race, after the balance write.
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

        // Rules 1 to 8, in order, the first failure wins. Everything past
        // this line only runs once the order is known to be acceptable.
        orderLogic.evaluate(order);

        AccountRow account = accountMapper.findById(request.accountId())
                .orElseThrow(() -> new IllegalStateException(
                        "Account " + request.accountId() + " passed evaluation but is missing at write time"));
        InstrumentRow instrument = instrumentMapper.findBySymbol(request.symbol())
                .orElseThrow(() -> new IllegalStateException(
                        "Instrument " + request.symbol() + " passed evaluation but is missing at write time"));

        BigDecimal cost = request.price().multiply(BigDecimal.valueOf(request.quantity()));
        BigDecimal newBalance = request.side() == OrderSide.BUY
                ? account.cashBalance().subtract(cost)
                : account.cashBalance().add(cost);

        // The optimistic-locking write: names the version this request read
        // and increments it. Zero rows affected means another request wrote
        // this account between our read and our write, and is refused rather
        // than treated as success.
        int affected = accountMapper.updateBalanceWithVersion(account.id(), newBalance, account.version());
        if (affected == 0) {
            throw new ConcurrentUpdateException(account.id());
        }

        order.markFilled(request.price());

        UUID orderId = UUID.randomUUID();
        try {
            orderMapper.insertOrder(
                    orderId, account.userId(), account.accountUuid(), instrument.instrumentId(),
                    order.getSide().name(), order.getQuantity(), order.getPrice(), order.getExecutedPrice(),
                    order.getStatus().name(), order.getIdempotencyKey());
        } catch (DataIntegrityViolationException e) {
            // The isUsed() check inside evaluate() raced a concurrent
            // request carrying the same key and lost; the UNIQUE constraint
            // on orders.idempotency_key is the actual guard, and this is it
            // firing.
            throw new DuplicateOrderException(order.getIdempotencyKey());
        }
        orderMapper.insertTrade(orderId, order.getExecutedPrice(), order.getQuantity());

        return new OrderResponseDto(
                "ORD-" + orderId,
                order.getStatus(),
                "Order executed",
                order.getSymbol(),
                order.getSide(),
                order.getQuantity(),
                order.getPrice());
    }

    @Transactional(rollbackFor = Exception.class)
    public OrderResponseDto cancelOrder(UUID orderId, Long callerAccountId) throws DomainException {
        OrderRow order = orderMapper.findByOrderId(orderId)
                .orElseThrow(() -> new OrderNotFoundException(orderId.toString()));

        AccountRow account = accountMapper.findById(order.accountId())
                .orElseThrow(() -> new IllegalStateException(
                        "Order " + orderId + " references missing account " + order.accountId()));
        accessGuard.requireActiveAndMatches(account, callerAccountId);

        // The guarded transition, in one statement: only an order still NEW
        // moves to CANCELLED. Zero rows affected means it already reached a
        // terminal state between our read above and this write.
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
