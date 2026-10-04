package com.trade.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Optional;

@Mapper
public interface PositionMapper {

    Optional<PositionRow> find(@Param("accountId") long accountId, @Param("symbol") String symbol);

    List<PositionRow> findAllForAccount(@Param("accountId") long accountId);
}
