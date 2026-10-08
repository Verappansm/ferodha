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

    /** Every argument but limit and offset is optional (null means no filter). */
    List<InstrumentRow> searchTradable(@Param("query") String likePattern, @Param("exchange") String exchange,
                                       @Param("sector") String sector, @Param("type") String type,
                                       @Param("limit") int limit, @Param("offset") long offset);

    long countSearchTradable(@Param("query") String likePattern, @Param("exchange") String exchange,
                             @Param("sector") String sector, @Param("type") String type);

    List<String> distinctTradableExchanges();

    List<String> distinctTradableSectors();

    List<String> distinctTradableTypes();
}
