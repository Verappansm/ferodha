package com.trade.executor.fauxnance;

import com.trade.executor.ticker.CurrentTickStore;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import com.trade.executor.config.FauxnanceClientConfig;
import org.springframework.test.context.TestPropertySource;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;

// The default wiring - see SpecExactQuoteSourceProfileTest for the retired
// alternative. Under market-sim, and equally with no profile at all, the live
// ticker (LiveTickQuoteSource) is the only candidate QuoteSource bean.
@SpringBootTest(classes = {FauxnanceClientConfig.class, FauxnanceQuoteClient.class,
        CurrentTickStore.class, LiveTickQuoteSource.class})
@ActiveProfiles("market-sim")
class MarketSimQuoteSourceProfileTest {

    @Autowired
    private QuoteSource quoteSource;

    @Test
    void liveTickerSourceIsSelectedUnderMarketSim() {
        assertInstanceOf(LiveTickQuoteSource.class, quoteSource);
    }
}
