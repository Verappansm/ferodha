package com.trade.domain;

import java.util.List;
import java.util.Optional;

// looks up an Instrument by symbol, and fetches all tradable instruments
public interface InstrumentRepository {

    Optional<Instrument> findBySymbol(String symbol);

    List<Instrument> findAllTradable(int limit, long offset);

    long countTradable();
}
