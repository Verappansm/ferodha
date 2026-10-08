package com.trade.executor.ticker;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

// Today's [low, high] per symbol, refreshed once a day by
// CandleRefreshScheduler. A symbol with no entry yet (service just started,
// or the day's refresh hasn't run) simply has no bounds to clamp against -
// TickGenerator skips it rather than guessing.
@Component
public class CandleBoundsStore {

    private final Map<String, RandomizerModel.Bounds> bounds = new ConcurrentHashMap<>();

    public void put(String symbol, RandomizerModel.Bounds value) {
        bounds.put(symbol, value);
    }

    public Optional<RandomizerModel.Bounds> get(String symbol) {
        return Optional.ofNullable(bounds.get(symbol));
    }
}
