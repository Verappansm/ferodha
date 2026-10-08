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

    // Every tradable symbol, plus any held or watched that has since been delisted: what
    // the price feed (com.trade.executor.ticker) prices and the market maker quotes.
    List<String> findTradableHeldOrWatchedSymbols();
}
