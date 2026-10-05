package com.trade.executor.mapper;

import org.apache.ibatis.annotations.Mapper;

import java.util.List;

@Mapper
public interface PollableSymbolMapper {

    // Symbols someone holds (a non-zero net position, derived from Trades
    // the same way trade_api's PositionMapper.xml does) or is watching
    // (Watchlist_Items) - never every symbol Instruments happens to know
    // about, per Story 8's explicit "poll only the symbols someone holds
    // or is watching."
    List<String> findPollableSymbols();
}
