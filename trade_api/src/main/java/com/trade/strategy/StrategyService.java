package com.trade.strategy;

import com.trade.enums.OrderSide;
import com.trade.exception.AccountNotFoundException;
import com.trade.exception.DomainException;
import com.trade.exception.InstrumentNotFoundException;
import com.trade.exception.InsufficientHoldingsException;
import com.trade.exception.InvalidParameterException;
import com.trade.exception.StrategyNotFoundException;
import com.trade.exception.StrategyStateException;
import com.trade.mapper.AccountMapper;
import com.trade.mapper.AccountRow;
import com.trade.mapper.InstrumentMapper;
import com.trade.mapper.PositionMapper;
import com.trade.mapper.PositionRow;
import com.trade.service.AccountAccessGuard;
import com.trade.service.OrderService;
import com.trade.strategy.StrategyDtos.CreateStrategyRequest;
import com.trade.strategy.StrategyDtos.StrategyEventResponse;
import com.trade.strategy.StrategyDtos.StrategyResponse;
import com.trade.strategy.mapper.StrategyMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;

// The customer's side of strategies: configure, enable, disable, read. Every
// method decides for itself whether this caller may reach this strategy
// (the token's accountId must own it), and answers STR-404 otherwise.
//
// A strategy is created DISABLED. Nothing trades until the customer enables
// it, and enabling needs an ACTIVE account.
@Service
public class StrategyService {

    private final StrategyMapper mapper;
    private final AccountMapper accountMapper;
    private final InstrumentMapper instrumentMapper;
    private final PositionMapper positionMapper;
    private final AccountAccessGuard accessGuard;
    private final OrderService orderService;
    private final BigDecimal feeRate;

    public StrategyService(StrategyMapper mapper, AccountMapper accountMapper, InstrumentMapper instrumentMapper,
                           PositionMapper positionMapper, AccountAccessGuard accessGuard, OrderService orderService,
                           @Value("${fee.rate}") BigDecimal feeRate) {
        this.mapper = mapper;
        this.accountMapper = accountMapper;
        this.instrumentMapper = instrumentMapper;
        this.positionMapper = positionMapper;
        this.accessGuard = accessGuard;
        this.orderService = orderService;
        this.feeRate = feeRate;
    }

    // What a strategy may be edited in: only one that is not running.
    private static final Set<String> EDITABLE = Set.of("DISABLED", "TRIPPED");

    // The rule as it will be stored, after every check on it has passed.
    private record Checked(String symbol, BigDecimal maxSpend, Integer maxPosition, int maxOrders,
                           int maxFailures, boolean dryRun) {
    }

    public StrategyResponse create(CreateStrategyRequest request, String userId, Long callerAccountId)
            throws DomainException {
        AccountRow account = activeAccount(callerAccountId);
        Checked rule = check(request, account);
        String id = mapper.insert(userId, account.id(), request.name().trim(), rule.symbol(),
                request.side().name(), request.triggerPrice(), request.quantity(), rule.maxSpend(),
                rule.maxPosition(), rule.maxOrders(), rule.maxFailures(), rule.dryRun(), request.expiresAt());
        mapper.insertEvent(id, "CREATED", "Created disabled");
        return StrategyResponse.from(mapper.findById(id));
    }

    // Changes the rule of a strategy that is not running (DISABLED, or TRIPPED
    // after failures). A running one must be disabled first, so the engine never
    // trades on a rule that is half changed. The same checks as creating apply,
    // and the strategy starts watching afresh when it is enabled again.
    public StrategyResponse update(String strategyId, CreateStrategyRequest request, Long callerAccountId)
            throws DomainException {
        Strategy current = owned(strategyId, callerAccountId);
        AccountRow account = activeAccount(callerAccountId);
        if (!EDITABLE.contains(current.status())) {
            throw new StrategyStateException(
                    "Only a disabled or stopped strategy can be edited. Disable it first.");
        }
        Checked rule = check(request, account);
        if (rule.maxOrders() < current.ordersPlaced()) {
            // It has already placed more orders than the new limit allows.
            throw new InvalidParameterException("maxOrders");
        }
        if (mapper.update(strategyId, request.name().trim(), rule.symbol(), request.side().name(),
                request.triggerPrice(), request.quantity(), rule.maxSpend(), rule.maxPosition(),
                rule.maxOrders(), rule.maxFailures(), rule.dryRun(), request.expiresAt()) != 1) {
            throw new StrategyStateException("This strategy changed while you were editing it. Reload and try again.");
        }
        mapper.insertEvent(strategyId, "EDITED", "Rule edited by the customer");
        return StrategyResponse.from(mapper.findById(strategyId));
    }

    private Checked check(CreateStrategyRequest request, AccountRow account) throws DomainException {
        String symbol = request.symbol().trim().toUpperCase();
        instrumentMapper.findBySymbol(symbol)
                .filter(i -> Boolean.TRUE.equals(i.tradable()))
                .orElseThrow(() -> new InstrumentNotFoundException(symbol));

        int quantity = request.quantity();
        boolean buy = request.side() == OrderSide.BUY;
        BigDecimal maxSpend = buy ? request.maxSpend() : null;
        Integer maxPosition = buy ? request.maxPosition() : null;
        if (buy) {
            // A BUY must say how much it may spend and hold, and both caps
            // must at least fit one order at the trigger price.
            BigDecimal oneOrder = request.triggerPrice().multiply(BigDecimal.valueOf(quantity));
            oneOrder = oneOrder.add(oneOrder.multiply(feeRate));
            if (maxSpend == null || maxSpend.compareTo(oneOrder) < 0) {
                throw new InvalidParameterException("maxSpend");
            }
            if (maxPosition == null || maxPosition < quantity) {
                throw new InvalidParameterException("maxPosition");
            }
        }
        if (!buy) {
            // There is no selling what is not held: a SELL strategy needs the
            // units in the account now (the engine checks again at every order).
            long held = positionMapper.find(account.id(), symbol).map(PositionRow::quantity).orElse(0L);
            if (held < quantity) {
                throw new InsufficientHoldingsException(quantity, held);
            }
        }
        if (request.expiresAt() != null && !request.expiresAt().isAfter(OffsetDateTime.now())) {
            throw new InvalidParameterException("expiresAt");
        }

        return new Checked(symbol, maxSpend, maxPosition,
                request.maxOrders() == null ? 1 : request.maxOrders(),
                request.maxFailures() == null ? 3 : request.maxFailures(),
                Boolean.TRUE.equals(request.dryRun()));
    }

    public List<StrategyResponse> list(Long callerAccountId) throws DomainException {
        activeAccount(callerAccountId);
        return mapper.findByAccount(callerAccountId).stream().map(StrategyResponse::from).toList();
    }

    public StrategyResponse get(String strategyId, Long callerAccountId) throws DomainException {
        return StrategyResponse.from(owned(strategyId, callerAccountId));
    }

    public List<StrategyEventResponse> events(String strategyId, Long callerAccountId) throws DomainException {
        owned(strategyId, callerAccountId);
        return mapper.findEvents(strategyId, 50).stream().map(StrategyEventResponse::from).toList();
    }

    public StrategyResponse enable(String strategyId, Long callerAccountId) throws DomainException {
        owned(strategyId, callerAccountId);
        activeAccount(callerAccountId);
        if (mapper.enable(strategyId) != 1) {
            throw new StrategyStateException("This strategy cannot be enabled: it is already enabled, "
                    + "has completed, or has expired");
        }
        mapper.insertEvent(strategyId, "ENABLED", "Enabled by the customer");
        return StrategyResponse.from(mapper.findById(strategyId));
    }

    // Stops the strategy at once (the engine and the JWT filter both look at the
    // row, not at a cached copy) and cancels its orders still working, so
    // nothing placed a moment ago fills after the customer said stop. Disabling
    // an already stopped strategy changes nothing.
    public StrategyResponse disable(String strategyId, Long callerAccountId) throws DomainException {
        owned(strategyId, callerAccountId);
        if (mapper.disable(strategyId) == 1) {
            int cancelled = 0;
            for (String orderId : mapper.findOpenOrderIds(strategyId)) {
                try {
                    orderService.cancelOrder(UUID.fromString(orderId), callerAccountId);
                    cancelled++;
                } catch (DomainException e) {
                    // Finished while we were cancelling: nothing left to stop.
                }
            }
            mapper.insertEvent(strategyId, "DISABLED", "Disabled by the customer"
                    + (cancelled > 0 ? "; " + cancelled + " working order(s) cancelled" : ""));
        }
        return StrategyResponse.from(mapper.findById(strategyId));
    }

    private Strategy owned(String strategyId, Long callerAccountId) throws DomainException {
        Strategy strategy;
        try {
            strategy = mapper.findById(UUID.fromString(strategyId).toString());
        } catch (IllegalArgumentException e) {
            throw new StrategyNotFoundException(strategyId);
        }
        if (strategy == null || !strategy.accountId().equals(callerAccountId)) {
            throw new StrategyNotFoundException(strategyId);
        }
        return strategy;
    }

    private AccountRow activeAccount(Long callerAccountId) throws DomainException {
        accessGuard.requireTokenMatches(callerAccountId, callerAccountId);
        AccountRow account = accountMapper.findById(callerAccountId)
                .orElseThrow(() -> new AccountNotFoundException(callerAccountId));
        accessGuard.requireActiveAndMatches(account, callerAccountId);
        return account;
    }
}
