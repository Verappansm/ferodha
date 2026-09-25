package com.trade.executor.expiry;

import com.trade.executor.mapper.OrderMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.TaskScheduler;

import java.time.OffsetDateTime;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// sweepOnce() itself, not the self-rescheduling chain around it - same
// split MarketDataPollerTest already draws between pollOnce() and its own
// TaskScheduler plumbing.
class OrderExpirySchedulerTest {

    private final OrderMapper orderMapper = mock(OrderMapper.class);
    private final TaskScheduler taskScheduler = mock(TaskScheduler.class);
    private OrderExpiryScheduler scheduler;

    @BeforeEach
    void setUp() {
        scheduler = new OrderExpiryScheduler(orderMapper, taskScheduler, 30, 60);
    }

    @Test
    @DisplayName("expires resting orders older than the configured TTL, cutoff roughly 30 minutes ago")
    void expiresOrdersOlderThanTtl() {
        when(orderMapper.expireStaleResting(any())).thenReturn(2);

        scheduler.sweepOnce();

        OffsetDateTime expectedCutoff = OffsetDateTime.now().minusMinutes(30);
        verify(orderMapper).expireStaleResting(
                argThat(cutoff -> Math.abs(java.time.Duration.between(cutoff, expectedCutoff).toSeconds()) < 5));
    }

    @Test
    @DisplayName("a failed sweep does not propagate - it is a housekeeping job, not correctness-critical")
    void failedSweepDoesNotThrow() {
        when(orderMapper.expireStaleResting(any())).thenThrow(new RuntimeException("db hiccup"));

        assertDoesNotThrow(() -> scheduler.sweepOnce());

        verify(orderMapper, times(1)).expireStaleResting(any());
    }
}
