package com.trade.executor.fauxnance;

import com.trade.executor.config.TradesGeneratorClientConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;

// The market-sim half of this pairing - see
// SpecExactQuoteSourceProfileTest for the other. With market-sim active,
// TradesGeneratorQuoteSource is the only candidate QuoteSource bean.
@SpringBootTest(classes = {TradesGeneratorClientConfig.class, TradesGeneratorQuoteSource.class})
@ActiveProfiles("market-sim")
@TestPropertySource(properties = {"trades-generator.base-url=http://trades-generator.test"})
class MarketSimQuoteSourceProfileTest {

    @Autowired
    private QuoteSource quoteSource;

    @Test
    void tradesGeneratorQuoteSourceIsSelectedWhenMarketSimIsActive() {
        assertInstanceOf(TradesGeneratorQuoteSource.class, quoteSource);
    }
}
