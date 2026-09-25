package com.trade.executor.expiry;

import com.trade.executor.mapper.OrderMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.OffsetDateTime;

// Only meaningful under market-sim: the quote-based path (default profile)
// always resolves an order to FILLED or REJECTED the moment trade_executor
// first sees it, so nothing can ever rest there long enough to need this.
// Under market-sim, a limit order with no crossing counterparty rests
// indefinitely by design (see OrderBookMatcher) - this sweep is what
// eventually reclaims one nobody ever crossed, cancelling it the same way
// a portal-initiated cancel would.
//
// Self-rescheduling against the shared TaskScheduler bean, the same shape
// MarketDataPoller already uses, rather than @Scheduled - this codebase has
// never wired @EnableScheduling, and a single fixed interval needs nothing
// @Scheduled would offer beyond what this pattern already gives it.
@Component
@Profile("market-sim")
public class OrderExpiryScheduler {

    private static final Logger log = LoggerFactory.getLogger(OrderExpiryScheduler.class);

    private final OrderMapper orderMapper;
    private final TaskScheduler taskScheduler;
    private final int ttlMinutes;
    private final int intervalSeconds;

    public OrderExpiryScheduler(OrderMapper orderMapper, TaskScheduler taskScheduler,
                                 @Value("${executor.expiry.ttl-minutes:30}") int ttlMinutes,
                                 @Value("${executor.expiry.interval-seconds:60}") int intervalSeconds) {
        this.orderMapper = orderMapper;
        this.taskScheduler = taskScheduler;
        this.ttlMinutes = ttlMinutes;
        this.intervalSeconds = intervalSeconds;
    }

    @PostConstruct
    void start() {
        scheduleNext();
    }

    private void scheduleNext() {
        taskScheduler.schedule(this::sweepOnce, Instant.now().plusSeconds(intervalSeconds));
    }

    void sweepOnce() {
        try {
            OffsetDateTime cutoff = OffsetDateTime.now().minusMinutes(ttlMinutes);
            int expired = orderMapper.expireStaleResting(cutoff);
            if (expired > 0) {
                log.info("Expired {} resting order(s) older than {} minutes", expired, ttlMinutes);
            }
        } catch (RuntimeException e) {
            // A failed sweep isn't fatal - try again on the next tick,
            // same reasoning MarketDataPoller already uses for its own
            // self-rescheduling chain.
            log.warn("Order-expiry sweep failed: {}", e.getMessage());
        } finally {
            scheduleNext();
        }
    }
}
