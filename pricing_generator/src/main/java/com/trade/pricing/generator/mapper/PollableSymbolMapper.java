package com.trade.pricing.generator.mapper;

import org.apache.ibatis.annotations.Mapper;

import java.util.List;

@Mapper
public interface PollableSymbolMapper {

    // Every tradable instrument, plus anything still held (a non-zero net
    // position) or watched after it was delisted - so every instrument page
    // has a live price and a chart. Quota: one batched /quotes call per 25
    // symbols per refresh, and one /candles call per symbol per day.
    List<String> findPollableSymbols();
}
