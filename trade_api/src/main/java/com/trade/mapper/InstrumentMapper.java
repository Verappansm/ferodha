package com.trade.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Mapper
public interface InstrumentMapper {

    Optional<InstrumentRow> findBySymbol(@Param("symbol") String symbol);

    Optional<InstrumentRow> findByInstrumentId(@Param("instrumentId") UUID instrumentId);

    List<InstrumentRow> findAllTradable(@Param("limit") int limit, @Param("offset") long offset);

    long countTradable();

    List<InstrumentRow> findTradableBySearch(@Param("searchPattern") String searchPattern, @Param("limit") int limit, @Param("offset") long offset);

    long countTradableBySearch(@Param("searchPattern") String searchPattern);
}
