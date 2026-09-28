package com.trade.domain;

import com.trade.enums.OrderSide;
import com.trade.exception.AccountNotActiveException;
import com.trade.exception.AccountNotFoundException;
import com.trade.exception.DomainException;
import com.trade.exception.DuplicateOrderException;
import com.trade.exception.InstrumentNotFoundException;
import com.trade.exception.InsufficientFundsException;
import com.trade.exception.InsufficientHoldingsException;
import com.trade.exception.InvalidOrderException;

import java.math.BigDecimal;
import java.util.Optional;

// rules 1 to 8 for placing an order
// evaluate() only checks and throws to test all 8 rules in isolation
public class OrderLogic {

    private final AccountRepository accounts;
    private final InstrumentRepository instruments;
    private final PositionRepository positions;
    private final IdempotencyKeyStore idempotencyKeys;

    public OrderLogic(AccountRepository accounts, InstrumentRepository instruments,
                       PositionRepository positions, IdempotencyKeyStore idempotencyKeys) {
        this.accounts = accounts;
        this.instruments = instruments;
        this.positions = positions;
        this.idempotencyKeys = idempotencyKeys;
    }

    public void evaluate(Order order) throws DomainException {

        // rule 1 the account must exist
        Account account = accounts.findById(order.getAccountId())
                .orElseThrow(() -> new AccountNotFoundException(order.getAccountId()));

        // rule 2 the account must be ACTIVE
        if (!account.isActive()) {
            throw new AccountNotActiveException(order.getAccountId(), account.getStatus());
        }

        // 3ule 3 the instrument must exist and still be tradable
        Instrument instrument = instruments.findBySymbol(order.getSymbol())
                .filter(Instrument::isTradable)
                .orElseThrow(() -> new InstrumentNotFoundException(order.getSymbol()));

        // rule 4 quantity must be greater than zero
        if (order.getQuantity() == null || order.getQuantity() <= 0) {
            throw new InvalidOrderException("quantity");
        }

        // rule 5 price must be greater than zero
        if (order.getPrice() == null || order.getPrice().signum() <= 0) {
            throw new InvalidOrderException("price");
        }

        // rule 6 balance should be enough to buy (quantity * price <= cash balance)
        if (order.getSide() == OrderSide.BUY) {
            BigDecimal cost = order.getPrice().multiply(BigDecimal.valueOf(order.getQuantity()));
            if (!account.isAffordable(cost)) {
                throw new InsufficientFundsException(cost, account.getBalance());
            }
        }

        // rule 7 a SELL must not exceed the current holdings
        if (order.getSide() == OrderSide.SELL) {
            Optional<Position> position = positions.find(order.getAccountId(), order.getSymbol());
            long held = position.map(Position::getQuantity).orElse(0L);
            if (order.getQuantity() > held) {
                throw new InsufficientHoldingsException(order.getQuantity(), held);
            }
        }

        // rule 8 the idempotency key must not already have been accepted
        if (idempotencyKeys.isUsed(order.getIdempotencyKey())) {
            throw new DuplicateOrderException(order.getIdempotencyKey());
        }
    }
}
