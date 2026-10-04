package com.trade.pricing.generator.pricing;

import com.trade.pricing.generator.mapper.MinuteBarMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

// Folds every published tick into its minute's bar in market_bars, the
// history behind the instrument page's 1D chart (Fauxnance candles are
// end-of-day only). The bar in progress is updated on every tick, so the
// chart's last point is never more than one tick old. Keeps
// generator.bars.retention-hours of history; a failed write only loses one
// point of the chart, never the tick itself.
@Component
public class MinuteBarRecorder {

    private static final Logger log = LoggerFactory.getLogger(MinuteBarRecorder.class);

    private final MinuteBarMapper barMapper;
    private final Duration retention;
    private final Clock clock;

    public MinuteBarRecorder(MinuteBarMapper barMapper,
                             @Value("${generator.bars.retention-hours:26}") long retentionHours) {
        this(barMapper, Duration.ofHours(retentionHours), Clock.systemUTC());
    }

    MinuteBarRecorder(MinuteBarMapper barMapper, Duration retention, Clock clock) {
        this.barMapper = barMapper;
        this.retention = retention;
        this.clock = clock;
    }

    public void record(String symbol, BigDecimal price) {
        OffsetDateTime barStart = OffsetDateTime.now(clock).withOffsetSameInstant(ZoneOffset.UTC)
                .truncatedTo(ChronoUnit.MINUTES);
        try {
            barMapper.upsertTick(symbol, barStart, price);
        } catch (Exception e) {
            log.warn("Failed to record the {} bar for {}: {}", barStart, symbol, e.getMessage());
        }
    }

    @Scheduled(fixedRate = 3_600_000, initialDelay = 60_000)
    void trim() {
        OffsetDateTime cutoff = OffsetDateTime.now(clock).withOffsetSameInstant(ZoneOffset.UTC).minus(retention);
        int deleted = barMapper.deleteBefore(cutoff);
        if (deleted > 0) {
            log.info("Deleted {} minute bars older than {}", deleted, cutoff);
        }
    }
}
