package com.trade.executor.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.math.BigDecimal;
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
}
