package com.trade.executor.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Optional;
import java.util.UUID;

@Mapper
public interface InstrumentMapper {

    Optional<InstrumentRow> findById(@Param("instrumentId") UUID instrumentId);
}
