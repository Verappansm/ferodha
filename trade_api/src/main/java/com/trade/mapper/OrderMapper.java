package com.trade.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Mapper
public interface OrderMapper {

    // Fast-path check only. It is not what makes rule 8 safe under
    // concurrency - the UNIQUE constraint on orders.idempotency_key is that
    // authority, and OrderService catches the constraint violation from
    // insertOrder(...) as the actual guard. This just avoids doing the work
    // of evaluating an order twice in the common case.
    boolean existsIdempotencyKey(@Param("idempotencyKey") String idempotencyKey);

    // Records the order row. Returns the affected row count (always 1 here)
    // rather than void, per the mapper convention this service follows
    // throughout: a write reports what happened, it does not ask its caller
    // to assume it.
    int insertOrder(@Param("orderId") UUID orderId,
                     @Param("userId") UUID userId,
                     @Param("accountUuid") UUID accountUuid,
                     @Param("instrumentId") UUID instrumentId,
                     @Param("side") String side,
                     @Param("quantity") int quantity,
                     @Param("price") BigDecimal price,
                     @Param("executedPrice") BigDecimal executedPrice,
                     @Param("status") String status,
                     @Param("idempotencyKey") String idempotencyKey,
                     @Param("feeRate") BigDecimal feeRate);

    // Records the matching execution row, kept for the position query in
    // PositionMapper, which derives holdings from Trades rather than from a
    // separately maintained running total.
    int insertTrade(@Param("orderId") UUID orderId,
                     @Param("executionPrice") BigDecimal executionPrice,
                     @Param("executionQuantity") int executionQuantity);

    Optional<OrderRow> findByOrderId(@Param("orderId") UUID orderId);

    // The guarded state transition, in one statement: only an order still in
    // NEW is moved to CANCELLED. Checking the status first and updating
    // second, as two statements, would race the Sprint 7 Trade Executor.
    int cancelIfNew(@Param("orderId") UUID orderId);

    // Marks the order's ORDER_PLACED event as acknowledged by Kafka. Called
    // from the producer's completion callback; a second call is a no-op.
    int markPublished(@Param("orderId") UUID orderId);

    // Portal orders still NEW whose event Kafka never acknowledged, placed
    // before the cutoff - see event.UnpublishedOrderSweeper.
    List<UnpublishedOrderRow> findUnpublished(@Param("placedBefore") OffsetDateTime placedBefore,
                                              @Param("limit") int limit);

    List<OrderHistoryRow> findHistory(@Param("accountId") long accountId,
                                       @Param("status") String status,
                                       @Param("from") OffsetDateTime from,
                                       @Param("to") OffsetDateTime to);
}
