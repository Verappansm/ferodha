package com.trade.generator.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

// Only ever used by OrderGenerator (market-sim only) - the write side that
// mirrors trade_api's own OrderService.placeOrder as closely as possible,
// so the resulting row and ORDER_PLACED event are indistinguishable to
// trade_executor from a real portal order, aside from source='RANDOMIZER'.
@Mapper
public interface OrderPlacementMapper {

    Optional<MarketMakerAccountRow> findMarketMaker(@Param("businessRef") String businessRef);

    Optional<InstrumentRow> findInstrumentBySymbol(@Param("symbol") String symbol);

    int insertOrder(@Param("orderId") UUID orderId,
                     @Param("userId") UUID userId,
                     @Param("accountUuid") UUID accountUuid,
                     @Param("instrumentId") UUID instrumentId,
                     @Param("side") String side,
                     @Param("quantity") int quantity,
                     @Param("price") BigDecimal price,
                     @Param("idempotencyKey") String idempotencyKey);
}
