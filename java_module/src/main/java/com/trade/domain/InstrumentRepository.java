package com.trade.domain;

import java.util.Optional;

// looks up an Instrument by symbol
public interface InstrumentRepository {

    Optional<Instrument> findBySymbol(String symbol);
}
