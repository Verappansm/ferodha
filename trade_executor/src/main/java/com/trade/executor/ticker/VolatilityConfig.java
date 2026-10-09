package com.trade.executor.ticker;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Map;

// Deliberately hardcoded, not computed from historical returns - that's a
// real analytical exercise (the etl/ candle pipeline already does something close to
// it for its own claims) and out of scope for what this service needs,
// which is "a plausible-looking amount of wiggle per symbol." Values are
// a fraction of mid-price moved per tick's noise term, not an annualised
// volatility figure.
@Component
public class VolatilityConfig {

    private static final Map<String, Double> HARDCODED = Map.of(
            "AAPL", 0.0010,
            "MSFT", 0.0009,
            "NVDA", 0.0022,
            "SPY", 0.0006,
            "TSLA", 0.0028
    );

    private final double defaultVolatility;

    public VolatilityConfig(@Value("${generator.tick.default-volatility:0.0015}") double defaultVolatility) {
        this.defaultVolatility = defaultVolatility;
    }

    public double forSymbol(String symbol) {
        return HARDCODED.getOrDefault(symbol, defaultVolatility);
    }
}
