package com.trade.executor.fauxnance;

import com.trade.executor.config.FauxnanceClientConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import com.trade.executor.config.TradesGeneratorClientConfig;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;

// The retired half of the profile pairing: only with fauxnance-direct active
// is FauxnanceQuoteClient a candidate, and the live-ticker source stands down.
// See MarketSimQuoteSourceProfileTest for the default wiring. Neither test
// exercises an actual network call; both only care which bean gets selected.
@SpringBootTest(classes = {FauxnanceClientConfig.class, FauxnanceQuoteClient.class,
        TradesGeneratorClientConfig.class, TradesGeneratorQuoteSource.class})
@ActiveProfiles("fauxnance-direct")
@TestPropertySource(properties = {"fauxnance.base-url=http://fauxnance.test", "fauxnance.api-key=test-key"})
class SpecExactQuoteSourceProfileTest {

    @Autowired
    private QuoteSource quoteSource;

    @Test
    void fauxnanceQuoteClientIsSelectedOnlyWhenFauxnanceDirectIsActive() {
        assertInstanceOf(FauxnanceQuoteClient.class, quoteSource);
    }
}
