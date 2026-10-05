package com.trade.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Optional;

@Mapper
public interface InstrumentMapper {

    Optional<InstrumentRow> findBySymbol(@Param("symbol") String symbol);

    List<InstrumentRow> findAllTradable(@Param("limit") int limit, @Param("offset") long offset);

    long countTradable();
}
