package com.trade.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Optional;

@Mapper
public interface InstrumentMapper {

    Optional<InstrumentRow> findBySymbol(@Param("symbol") String symbol);
}
