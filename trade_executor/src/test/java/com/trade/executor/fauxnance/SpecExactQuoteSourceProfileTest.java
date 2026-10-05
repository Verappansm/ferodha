package com.trade.executor.fauxnance;

import com.trade.executor.config.FauxnanceClientConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;

// Proves the profile switch itself: with no profile active (the spec-exact
// story this repo was built against), FauxnanceQuoteClient is the only
// candidate QuoteSource bean - see TradesGeneratorQuoteSourceProfileTest
// for the market-sim half of this pairing. Neither test exercises an
// actual network call; both only care which bean gets selected.
@SpringBootTest(classes = {FauxnanceClientConfig.class, FauxnanceQuoteClient.class})
@TestPropertySource(properties = {"fauxnance.base-url=http://fauxnance.test", "fauxnance.api-key=test-key"})
class SpecExactQuoteSourceProfileTest {

    @Autowired
    private QuoteSource quoteSource;

    @Test
    void fauxnanceQuoteClientIsSelectedWhenMarketSimIsNotActive() {
        assertInstanceOf(FauxnanceQuoteClient.class, quoteSource);
    }
}
