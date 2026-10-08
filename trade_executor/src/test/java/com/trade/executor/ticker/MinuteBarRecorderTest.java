package com.trade.executor.ticker;

import com.trade.executor.mapper.ticker.MinuteBarMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class MinuteBarRecorderTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-05T09:31:47Z"), ZoneOffset.UTC);

    @Test
    void aTickLandsInTheBarOfItsMinute() {
        MinuteBarMapper mapper = mock(MinuteBarMapper.class);
        new MinuteBarRecorder(mapper, Duration.ofHours(72), CLOCK).record("AAPL", new BigDecimal("231.25"));

        verify(mapper).upsertTick("AAPL", OffsetDateTime.parse("2026-10-05T09:31:00Z"), new BigDecimal("231.25"));
    }

    @Test
    void aFailedWriteNeverStopsTheTick() {
        MinuteBarMapper mapper = mock(MinuteBarMapper.class);
        doThrow(new RuntimeException("database down")).when(mapper).upsertTick(any(), any(), any());

        assertDoesNotThrow(() ->
                new MinuteBarRecorder(mapper, Duration.ofHours(72), CLOCK).record("AAPL", BigDecimal.ONE));
    }

    @Test
    void trimDeletesBarsOlderThanTheRetention() {
        MinuteBarMapper mapper = mock(MinuteBarMapper.class);
        new MinuteBarRecorder(mapper, Duration.ofHours(72), CLOCK).trim();

        verify(mapper).deleteBefore(eq(OffsetDateTime.parse("2026-10-02T09:31:47Z")));
    }
}
