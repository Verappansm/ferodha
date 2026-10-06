package com.trade.strategy;

import com.trade.dto.PlaceOrderRequestDto;
import com.trade.enums.OrderSide;
import com.trade.mapper.PositionMapper;
import com.trade.mapper.PositionRow;
import com.trade.strategy.mapper.StrategyMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Optional;

// Decides, quote by quote, whether an ENABLED strategy fires, and places the
// order if it does. Every guard sits at the point of decision:
//
//   stale quote   ignored: a delayed price is not a reason to spend money
//   crossing      TriggerRule: edge-triggered, never a repeat on a held level
//   risk limits   RiskLimits: max spend, max position, units to sell
//   dry run       logged as WOULD_FIRE and never placed
//   claim         one guarded UPDATE that only succeeds while the strategy is
//                 still ENABLED with orders left. A strategy disabled a moment
//                 ago, even in the middle of this loop, is refused here
//   placement     through POST /api/v1/orders with a delegated token, which
//                 the JWT filter checks against the strategy once more
//
// Anything unexpected fails closed: no order, a FAILED event, and one step
// closer to the breaker that trips the strategy after max-failures in a row.
@Service
public class StrategyEngine {

    private static final Logger log = LoggerFactory.getLogger(StrategyEngine.class);

    private final StrategyMapper mapper;
    private final PositionMapper positions;
    private final OrderPlacer placer;
    private final StrategyTokenIssuer tokens;
    private final BigDecimal feeRate;
    private final Duration maxQuoteAge;
    private final Clock clock;

    @Autowired
    public StrategyEngine(StrategyMapper mapper, PositionMapper positions, OrderPlacer placer,
                          StrategyTokenIssuer tokens, @Value("${fee.rate}") BigDecimal feeRate,
                          @Value("${strategy.max-quote-age-seconds:900}") long maxQuoteAgeSeconds) {
        this(mapper, positions, placer, tokens, feeRate, Duration.ofSeconds(maxQuoteAgeSeconds), Clock.systemUTC());
    }

    StrategyEngine(StrategyMapper mapper, PositionMapper positions, OrderPlacer placer,
                   StrategyTokenIssuer tokens, BigDecimal feeRate, Duration maxQuoteAge, Clock clock) {
        this.mapper = mapper;
        this.positions = positions;
        this.placer = placer;
        this.tokens = tokens;
        this.feeRate = feeRate;
        this.maxQuoteAge = maxQuoteAge;
        this.clock = clock;
    }

    public void onQuote(String symbol, BigDecimal bid, BigDecimal ask, OffsetDateTime asOf) {
        if (asOf == null || asOf.isBefore(OffsetDateTime.now(clock).minus(maxQuoteAge))) {
            return;
        }
        for (Strategy strategy : mapper.findEnabledBySymbol(symbol)) {
            try {
                evaluate(strategy, bid, ask, asOf);
            } catch (RuntimeException e) {
                log.warn("Strategy {} failed on a {} quote: {}", strategy.strategyId(), symbol, e.toString());
                fail(strategy.strategyId(), "Unexpected error: " + e.getClass().getSimpleName());
            }
        }
    }

    // trade-events: an order of a strategy was rejected by the executor.
    public void onOrderRejected(String orderId, String reason) {
        String strategyId = strategyOf(orderId);
        if (strategyId != null) {
            fail(strategyId, "Order rejected by the executor: " + reason);
        }
    }

    // trade-events: an order of a strategy filled. The streak of failures ends.
    public void onOrderFilled(String orderId) {
        String strategyId = strategyOf(orderId);
        if (strategyId != null) {
            mapper.resetFailures(strategyId);
            event(strategyId, "FILLED", "Order " + orderId + " filled");
        }
    }

    private void evaluate(Strategy s, BigDecimal bid, BigDecimal ask, OffsetDateTime asOf) {
        String id = s.strategyId();
        if (s.expiresAt() != null && s.expiresAt().isBefore(OffsetDateTime.now(clock))) {
            if (mapper.expire(id) == 1) {
                event(id, "EXPIRED", "The expiry date has passed");
            }
            return;
        }
        BigDecimal price = s.isBuy() ? ask : bid;
        if (price == null) {
            return;
        }
        if (!TriggerRule.crossed(s.side(), s.triggerPrice(), s.lastPrice(), price)) {
            mapper.setLastPrice(id, price);
            return;
        }

        BigDecimal limit = TriggerRule.limitPrice(s.side(), price);
        Optional<String> blocked = RiskLimits.check(s, committedSpend(s), unitsAvailable(s), limit, feeRate);
        if (blocked.isPresent()) {
            mapper.setLastPrice(id, price);
            event(id, "BLOCKED", blocked.get());
            return;
        }
        if (Boolean.TRUE.equals(s.dryRun())) {
            mapper.setLastPrice(id, price);
            event(id, "WOULD_FIRE", s.side() + " " + s.quantity() + " " + s.symbol() + " at " + limit
                    + " (dry run, nothing placed)");
            return;
        }

        // The gate. Disabled, completed, expired or out of orders: no trade.
        if (mapper.claim(id, price) != 1) {
            event(id, "SKIPPED", "No longer enabled, or no orders left");
            return;
        }
        place(s, limit, asOf);
    }

    private void place(Strategy s, BigDecimal limit, OffsetDateTime asOf) {
        String id = s.strategyId();
        // Deterministic: the same strategy and quote can only ever be one order.
        String key = "strat-" + id + "-" + asOf.toEpochSecond();
        try {
            String orderId = placer.place(tokens.issue(s), new PlaceOrderRequestDto(
                    s.accountId(), s.symbol(), OrderSide.valueOf(s.side()), s.quantity(), limit, key));
            mapper.tagOrder(key, id);
            mapper.completeIfDone(id);
            event(id, "PLACED", s.side() + " " + s.quantity() + " " + s.symbol() + " at " + limit
                    + " as " + orderId);
        } catch (RuntimeException e) {
            // The route can fail after it has saved the order (the broker was
            // unreachable when it published, or the answer was lost). Look the
            // order up by its key: if it exists it was placed, and must stay
            // counted and tagged, or the strategy would place it again.
            if (mapper.tagOrder(key, id) == 1) {
                mapper.completeIfDone(id);
                event(id, "PLACED", s.side() + " " + s.quantity() + " " + s.symbol() + " at " + limit
                        + "; the order route reported a problem afterwards: " + e.getMessage());
                return;
            }
            mapper.release(id);
            fail(id, e.getMessage());
        }
    }

    private BigDecimal committedSpend(Strategy s) {
        return s.isBuy() ? mapper.committedSpend(s.strategyId()) : BigDecimal.ZERO;
    }

    // BUY: held plus pending buys (what the position would be). SELL: held
    // minus pending sells (what is still free to sell).
    private long unitsAvailable(Strategy s) {
        long held = positions.find(s.accountId(), s.symbol()).map(PositionRow::quantity).orElse(0L);
        Long pending = mapper.pendingQuantity(s.accountId(), s.symbol(), s.side());
        long pendingUnits = pending == null ? 0 : pending;
        return s.isBuy() ? held + pendingUnits : held - pendingUnits;
    }

    private void fail(String strategyId, String detail) {
        mapper.recordFailure(strategyId);
        event(strategyId, "FAILED", detail);
        Strategy after = mapper.findById(strategyId);
        if (after != null && "TRIPPED".equals(after.status())) {
            event(strategyId, "TRIPPED", after.consecutiveFailures() + " failures in a row: stopped until re-enabled");
        }
    }

    private String strategyOf(String orderId) {
        String raw = orderId == null ? "" : orderId.startsWith("ORD-") ? orderId.substring(4) : orderId;
        try {
            return mapper.strategyIdOfOrder(java.util.UUID.fromString(raw).toString());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private void event(String strategyId, String kind, String detail) {
        mapper.insertEvent(strategyId, kind, detail == null ? null : detail.length() > 300 ? detail.substring(0, 300) : detail);
    }
}
