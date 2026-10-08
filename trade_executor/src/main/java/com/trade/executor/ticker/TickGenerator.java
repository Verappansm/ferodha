package com.trade.executor.ticker;

import com.trade.executor.ticker.event.TickPublisher;
import com.trade.executor.ticker.fauxnance.Quote;
import com.trade.executor.mapper.PollableSymbolMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Random;

// Every five seconds (default, configurable): the live tick, under every
// profile - this service is the platform's one live price feed (market-data,
// the 1D chart's minute bars). trade_executor's MarketDataPoller is off by
// default; the profiles differ only in how trade_executor settles orders.
// A symbol with no real anchor yet, or no candle bounds yet, is skipped for
// this tick rather than guessed at - it'll start ticking the cycle after
// both refreshes have run at least once.
@Component
public class TickGenerator {

    private static final Logger log = LoggerFactory.getLogger(TickGenerator.class);

    private final PollableSymbolMapper symbolMapper;
    private final QuoteAnchorStore anchorStore;
    private final CandleBoundsStore boundsStore;
    private final CurrentTickStore currentTickStore;
    private final VolatilityConfig volatilityConfig;
    private final TickPublisher tickPublisher;
    private final MinuteBarRecorder barRecorder;
    private final Random random = new Random();

    public TickGenerator(PollableSymbolMapper symbolMapper, QuoteAnchorStore anchorStore,
                          CandleBoundsStore boundsStore, CurrentTickStore currentTickStore,
                          VolatilityConfig volatilityConfig, TickPublisher tickPublisher,
                          MinuteBarRecorder barRecorder) {
        this.symbolMapper = symbolMapper;
        this.anchorStore = anchorStore;
        this.boundsStore = boundsStore;
        this.currentTickStore = currentTickStore;
        this.volatilityConfig = volatilityConfig;
        this.tickPublisher = tickPublisher;
        this.barRecorder = barRecorder;
    }

    @Scheduled(fixedRateString = "${generator.tick.interval-seconds:5}000", initialDelayString = "5000")
    void tick() {
        List<String> symbols = symbolMapper.findTradableHeldOrWatchedSymbols();
        for (String symbol : symbols) {
            generateOne(symbol);
        }
    }

    private void generateOne(String symbol) {
        var anchorOpt = anchorStore.getAnchor(symbol);
        var boundsOpt = boundsStore.get(symbol);
        if (anchorOpt.isEmpty() || boundsOpt.isEmpty()) {
            return;
        }
        Quote anchor = anchorOpt.get();
        RandomizerModel.Bounds bounds = boundsOpt.get();
        BigDecimal lastMid = anchorStore.getLastMidOrAnchor(symbol, anchor);
        double volatility = volatilityConfig.forSymbol(symbol);

        Quote tick = RandomizerModel.next(anchor, lastMid, bounds, volatility, random.nextGaussian());

        BigDecimal mid = tick.bid().add(tick.ask()).divide(BigDecimal.valueOf(2), 6, RoundingMode.HALF_UP);
        anchorStore.setLastMid(symbol, mid);
        currentTickStore.put(symbol, tick);
        tickPublisher.publishTick(symbol, tick);
        barRecorder.record(symbol, mid);
    }
}
