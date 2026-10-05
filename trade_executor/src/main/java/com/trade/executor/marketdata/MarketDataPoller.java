package com.trade.executor.marketdata;

import com.trade.executor.event.MarketDataPublisher;
import com.trade.executor.fauxnance.Quote;
import com.trade.executor.fauxnance.QuoteSource;
import com.trade.executor.mapper.PollableSymbolMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;
import java.util.Map;

// A scheduled component inside the executor - not a project, container, or
// runtime of its own, and it shares the same Fauxnance client and Kafka
// producer trade order execution already uses (QuoteSource, KafkaTemplate
// via MarketDataPublisher). Deliberately self-rescheduling rather than a
// fixed @Scheduled rate: the interval floor (PollScheduleCalculator) has to
// be recomputed against however many symbols are pollable *right now*,
// since that set can grow as more accounts hold or watch instruments, and
// a rate fixed once at startup could never react to that.
//
// The poll schedule has nothing to do with order placement - this class
// never touches Orders, Accounts, or the orders/trade-events topics.
//
// Off unless executor.market-data.poller-enabled=true. pricing_generator is
// the platform's live price feed under every profile and publishes the
// same market-data messages; two publishers would interleave real and
// simulated prices on one topic and spend the Fauxnance quota twice. Kept
// for a deployment without pricing_generator. Never under market-sim.
// (Order fills are not affected: under the default profile the executor
// still prices each fill with its own Fauxnance quote.)
@Component
@Profile("!market-sim")
@ConditionalOnProperty(name = "executor.market-data.poller-enabled", havingValue = "true")
public class MarketDataPoller {

    private static final Logger log = LoggerFactory.getLogger(MarketDataPoller.class);
    static final int BATCH_SIZE = 25;

    private final PollableSymbolMapper symbolMapper;
    private final QuoteSource quoteSource;
    private final MarketDataPublisher publisher;
    private final TaskScheduler taskScheduler;
    private final PollScheduleCalculator scheduleCalculator;
    private final int configuredIntervalSeconds;

    public MarketDataPoller(PollableSymbolMapper symbolMapper, QuoteSource quoteSource,
                             MarketDataPublisher publisher, TaskScheduler taskScheduler,
                             PollScheduleCalculator scheduleCalculator,
                             @Value("${executor.market-data.poll-interval-seconds:60}") int configuredIntervalSeconds) {
        this.symbolMapper = symbolMapper;
        this.quoteSource = quoteSource;
        this.publisher = publisher;
        this.taskScheduler = taskScheduler;
        this.scheduleCalculator = scheduleCalculator;
        this.configuredIntervalSeconds = configuredIntervalSeconds;
    }

    @PostConstruct
    void start() {
        scheduleNext(configuredIntervalSeconds);
    }

    private void scheduleNext(int delaySeconds) {
        taskScheduler.schedule(this::pollOnce, Instant.now().plusSeconds(delaySeconds));
    }

    void pollOnce() {
        try {
            List<String> symbols = symbolMapper.findPollableSymbols();
            int effectiveInterval = scheduleCalculator.effectiveIntervalSeconds(configuredIntervalSeconds, symbols.size());
            if (effectiveInterval != configuredIntervalSeconds) {
                log.warn("Configured poll interval {}s would exceed the daily Fauxnance quota for {} symbols"
                                + " - polling every {}s instead",
                        configuredIntervalSeconds, symbols.size(), effectiveInterval);
            }

            for (int start = 0; start < symbols.size(); start += BATCH_SIZE) {
                List<String> batch = symbols.subList(start, Math.min(start + BATCH_SIZE, symbols.size()));
                Map<String, Quote> quotes = quoteSource.fetchQuotes(batch);
                // One Kafka message per symbol, never one per batch -
                // batching the HTTP call is a quota optimisation, batching
                // the Kafka message would destroy per-symbol ordering.
                quotes.forEach(publisher::publishQuote);
            }

            scheduleNext(effectiveInterval);
        } catch (RuntimeException e) {
            // A failed poll cycle isn't fatal - log it and try again on the
            // next tick rather than letting the self-rescheduling chain die.
            log.warn("Market-data poll cycle failed: {}", e.getMessage());
            scheduleNext(configuredIntervalSeconds);
        }
    }
}
