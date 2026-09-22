package com.trade.generator.mapper;

import org.apache.ibatis.annotations.Mapper;

import java.util.List;

@Mapper
public interface PollableSymbolMapper {

    // Symbols someone holds (a non-zero net position) or is watching -
    // identical query to trade_executor's own PollableSymbolMapper, copied
    // rather than shared per this repo's established convention between
    // independently-deployed services.
    List<String> findPollableSymbols();
}
