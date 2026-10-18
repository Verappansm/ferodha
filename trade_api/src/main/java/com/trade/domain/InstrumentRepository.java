package com.trade.domain;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

// looks up an Instrument by symbol, and fetches all tradable instruments
public interface InstrumentRepository {

    Optional<Instrument> findBySymbol(String symbol);

    Optional<Instrument> findByInstrumentId(UUID instrumentId);

    /**
     * The instruments with these ids, keyed by id; an unknown id is simply absent.
     * The database implementation does this in one query, so a list screen does not
     * look its instruments up one by one.
     */
    default Map<UUID, Instrument> findByInstrumentIds(Collection<UUID> instrumentIds) {
        Map<UUID, Instrument> found = new HashMap<>();
        for (UUID id : instrumentIds) {
            findByInstrumentId(id).ifPresent(instrument -> found.put(id, instrument));
        }
        return found;
    }

    List<Instrument> findAllTradable(int limit, long offset);

    long countTradable();

}
