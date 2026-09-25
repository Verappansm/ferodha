package com.trade.executor.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Mapper
public interface OrderMapper {

    Optional<OrderRow> findById(@Param("orderId") UUID orderId);

    // Guard 1: the status update is the first write in the settlement
    // transaction and is conditional on the order still being NEW. Zero
    // rows affected means a prior delivery already settled this order.
    int fillOrderIfNew(@Param("orderId") UUID orderId,
                        @Param("executedPrice") BigDecimal executedPrice,
                        @Param("feeAmount") BigDecimal feeAmount);

    int rejectOrderIfNew(@Param("orderId") UUID orderId,
                          @Param("rejectionReason") String rejectionReason);

    // The "position write" - positions are derived from Trades+Orders (see
    // Positions_View / trade_api's PositionMapper.xml), so inserting the
    // fill here is what makes it visible on the next position read.
    int insertTrade(@Param("orderId") UUID orderId,
                     @Param("executionPrice") BigDecimal executionPrice,
                     @Param("executionQuantity") Integer executionQuantity);

    // The matching engine, only ever consulted when executor.matching.enabled
    // is true (see OrderBookMatcher) - resting opposite-side liquidity on
    // the same instrument, price-then-time priority. Plain SELECT, no row
    // lock - same optimistic-lock convention as everything else in this
    // codebase (SettlementService's account-balance guard included):
    // matchRestingOrderIfUnchanged is what actually prevents two concurrent
    // matches from both claiming the same resting order's quantity.
    List<OrderRow> findRestingOpposite(@Param("instrumentId") UUID instrumentId,
                                        @Param("side") String oppositeSide,
                                        @Param("crossPrice") BigDecimal crossPrice,
                                        @Param("excludeOrderId") UUID excludeOrderId);

    // Guard for the incoming order's own cumulative state - same "still
    // NEW" condition Guard 1 already uses, since this is that order's
    // first-ever processing (a genuine redelivery is caught earlier, by
    // OrderExecutionService's own cheap status check, before this is ever
    // called). feeAmount is the sum across every match this order made in
    // this one walk - written once here, not per-match, since this row is
    // only ever touched once (see OrderBookMatcher).
    int matchIncomingOrderIfNew(@Param("orderId") UUID orderId,
                                 @Param("matchedQuantity") int matchedQuantity,
                                 @Param("newStatus") String newStatus,
                                 @Param("executedPrice") BigDecimal executedPrice,
                                 @Param("feeAmount") BigDecimal feeAmount);

    // Guard for a resting counterparty order - optimistic-lock style,
    // conditional on filled_quantity still being exactly what was just
    // read. Zero rows affected means another delivery matched this same
    // resting order first; OrderBookMatcher re-reads and continues against
    // whatever is actually still left, the same re-read-and-retry shape
    // SettlementService already uses for the account-balance guard.
    int matchRestingOrderIfUnchanged(@Param("orderId") UUID orderId,
                                      @Param("previousFilledQuantity") int previousFilledQuantity,
                                      @Param("matchedQuantity") int matchedQuantity,
                                      @Param("newStatus") String newStatus,
                                      @Param("executedPrice") BigDecimal executedPrice,
                                      @Param("feeAmount") BigDecimal feeAmount);

    // The TTL sweep (see OrderExpiryScheduler, market-sim only) - a plain
    // bulk UPDATE, not a per-row optimistic-lock loop, since housekeeping
    // has no single caller to retry against contention: whichever orders
    // are still resting and older than the cutoff at the moment this runs
    // get cancelled, and any that a concurrent match claims first simply
    // fail this WHERE clause's status check and are left alone. Returns
    // the number of orders cancelled, purely for logging.
    int expireStaleResting(@Param("cutoff") OffsetDateTime cutoff);
}
