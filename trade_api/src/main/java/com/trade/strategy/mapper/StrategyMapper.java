package com.trade.strategy.mapper;

import com.trade.strategy.Strategy;
import com.trade.strategy.StrategyEvent;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

// Every state change is one guarded UPDATE: it names the status it expects, so
// a strategy disabled a moment ago can never be claimed, and a count can never
// be read and written back stale.
@Mapper
public interface StrategyMapper {

    // Returns the new strategy id (INSERT ... RETURNING).
    String insert(@Param("userId") String userId, @Param("accountId") long accountId,
               @Param("name") String name, @Param("symbol") String symbol, @Param("side") String side,
               @Param("triggerPrice") BigDecimal triggerPrice, @Param("quantity") int quantity,
               @Param("maxSpend") BigDecimal maxSpend, @Param("maxPosition") Integer maxPosition,
               @Param("maxOrders") int maxOrders, @Param("maxFailures") int maxFailures,
               @Param("dryRun") boolean dryRun, @Param("expiresAt") OffsetDateTime expiresAt);

    Strategy findById(@Param("strategyId") String strategyId);

    List<Strategy> findByAccount(@Param("accountId") long accountId);

    List<Strategy> findEnabledBySymbol(@Param("symbol") String symbol);

    // DISABLED or TRIPPED -> ENABLED, with a clean failure count and no
    // remembered price, so the first crossing is measured from a fresh tick.
    int enable(@Param("strategyId") String strategyId);

    int disable(@Param("strategyId") String strategyId);

    // The one gate in front of every order: only an ENABLED strategy with
    // orders left (and not past its expiry) is claimed, and the claim and the
    // new last price are one statement. Zero rows means: do not trade.
    int claim(@Param("strategyId") String strategyId, @Param("price") BigDecimal price);

    int release(@Param("strategyId") String strategyId);

    int completeIfDone(@Param("strategyId") String strategyId);

    int expire(@Param("strategyId") String strategyId);

    int setLastPrice(@Param("strategyId") String strategyId, @Param("price") BigDecimal price);

    // Adds one failure and trips the strategy, in the same statement, when the
    // count reaches its limit.
    int recordFailure(@Param("strategyId") String strategyId);

    int resetFailures(@Param("strategyId") String strategyId);

    int insertEvent(@Param("strategyId") String strategyId, @Param("kind") String kind,
                    @Param("detail") String detail);

    List<StrategyEvent> findEvents(@Param("strategyId") String strategyId, @Param("limit") int limit);

    // Fee-inclusive value of the strategy's buys that are live or filled.
    BigDecimal committedSpend(@Param("strategyId") String strategyId);

    // Units still to fill on the account's live orders in this symbol and side.
    Long pendingQuantity(@Param("accountId") long accountId, @Param("symbol") String symbol,
                         @Param("side") String side);

    int tagOrder(@Param("idempotencyKey") String idempotencyKey, @Param("strategyId") String strategyId);

    String strategyIdOfOrder(@Param("orderId") String orderId);

    List<String> findOpenOrderIds(@Param("strategyId") String strategyId);
}
