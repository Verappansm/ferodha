package com.trade.event;

import com.trade.mapper.OrderMapper;
import com.trade.mapper.UnpublishedOrderRow;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UnpublishedOrderSweeperTest {

    private static final UUID ORDER_UUID = UUID.fromString("6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e");

    private OrderMapper orderMapper;
    private OrderPlacedPublisher publisher;
    private UnpublishedOrderSweeper sweeper;

    @BeforeEach
    void setUp() {
        orderMapper = mock(OrderMapper.class);
        publisher = mock(OrderPlacedPublisher.class);
        sweeper = new UnpublishedOrderSweeper(orderMapper, publisher, 30, 100);
    }

    @Test
    void resendsAStuckOrderWithTheSameIdsItWasPlacedWith() {
        OffsetDateTime placedAt = OffsetDateTime.of(2026, 9, 28, 10, 0, 0, 0, ZoneOffset.UTC);
        when(orderMapper.findUnpublished(any(), eq(100))).thenReturn(List.of(new UnpublishedOrderRow(
                ORDER_UUID, 1L, "ACME", "BUY", 100, new BigDecimal("25.50"), "idem-1", placedAt)));

        sweeper.sweep();

        ArgumentCaptor<OrderPlacedPayload> sent = ArgumentCaptor.forClass(OrderPlacedPayload.class);
        verify(publisher).publish(sent.capture());
        assertThat(sent.getValue().orderId()).isEqualTo("ORD-" + ORDER_UUID);
        assertThat(sent.getValue().accountId()).isEqualTo(1L);
        assertThat(sent.getValue().idempotencyKey()).isEqualTo("idem-1");
        assertThat(sent.getValue().createdOn()).isEqualTo(placedAt.toInstant());
    }

    @Test
    void onlyLooksAtOrdersOlderThanTheGracePeriod() {
        when(orderMapper.findUnpublished(any(), anyInt())).thenReturn(List.of());
        OffsetDateTime before = OffsetDateTime.now().minusSeconds(30);

        sweeper.sweep();

        ArgumentCaptor<OffsetDateTime> cutoff = ArgumentCaptor.forClass(OffsetDateTime.class);
        verify(orderMapper).findUnpublished(cutoff.capture(), eq(100));
        assertThat(cutoff.getValue()).isAfterOrEqualTo(before);
        assertThat(cutoff.getValue()).isBefore(OffsetDateTime.now().minusSeconds(29));
        verify(publisher, never()).publish(any());
    }

    @Test
    void aFailedSweepIsSwallowedAndRetriedNextCycle() {
        when(orderMapper.findUnpublished(any(), anyInt())).thenThrow(new IllegalStateException("db down"));

        assertThatCode(() -> sweeper.sweep()).doesNotThrowAnyException();
        verify(publisher, never()).publish(any());
    }
}
