package com.trade.generator.web;

import com.trade.generator.fauxnance.Quote;
import com.trade.generator.pricing.CurrentTickStore;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

// What trade_executor's TradesGeneratorQuoteSource calls under the
// market-sim profile, in place of Fauxnance directly - same shape as the
// current tick published to market-data, since they're the same value.
// Not authenticated: internal service-to-service traffic on the compose
// network only, same trust boundary Fauxnance itself sits behind from this
// platform's perspective.
@RestController
public class QuoteController {

    private final CurrentTickStore currentTickStore;

    public QuoteController(CurrentTickStore currentTickStore) {
        this.currentTickStore = currentTickStore;
    }

    @GetMapping("/api/v1/quotes/{symbol}")
    public Quote getQuote(@PathVariable String symbol) {
        return currentTickStore.get(symbol).orElse(null);
    }

    @GetMapping("/api/v1/quotes")
    public Map<String, Quote> getQuotes(@RequestParam String symbols) {
        Map<String, Quote> result = new LinkedHashMap<>();
        for (String symbol : Arrays.asList(symbols.split(","))) {
            currentTickStore.get(symbol).ifPresent(quote -> result.put(symbol, quote));
        }
        return result;
    }
}
