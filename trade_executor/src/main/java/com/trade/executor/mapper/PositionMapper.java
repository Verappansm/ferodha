package com.trade.executor.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.UUID;

@Mapper
public interface PositionMapper {

    // Rule 7's execution-time re-check: net units currently held, derived
    // from Trades the same way trade_api's PositionMapper.xml does. Never
    // negative-only by construction - returns 0 when nothing is held.
    long findHeldQuantity(@Param("accountUuid") UUID accountUuid, @Param("instrumentId") UUID instrumentId);
}
