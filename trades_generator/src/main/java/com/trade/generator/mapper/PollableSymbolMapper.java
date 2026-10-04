package com.trade.generator.mapper;

import org.apache.ibatis.annotations.Mapper;

import java.util.List;

@Mapper
public interface PollableSymbolMapper {

    // Every tradable instrument, plus anything still held or watched after it
    // was delisted - the same set pricing_generator prices, so every
    // instrument a customer can trade under market-sim has counter-orders.
    List<String> findPollableSymbols();
}
