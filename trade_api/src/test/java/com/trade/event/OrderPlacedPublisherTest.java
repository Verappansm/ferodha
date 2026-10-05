package com.trade.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.trade.enums.OrderSide;
import com.trade.mapper.OrderMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OrderPlacedPublisherTest {

    private static final UUID ORDER_UUID = UUID.fromString("6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e");

    private KafkaTemplate<String, String> kafkaTemplate;
    private OrderMapper orderMapper;
    private OrderPlacedPublisher publisher;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        kafkaTemplate = mock(KafkaTemplate.class);
        orderMapper = mock(OrderMapper.class);
        ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
        publisher = new OrderPlacedPublisher(kafkaTemplate, objectMapper, orderMapper, "orders");
    }

    private static OrderPlacedPayload payload() {
        return new OrderPlacedPayload("ORD-" + ORDER_UUID, 1L, "ACME", OrderSide.BUY, 100,
                new BigDecimal("25.50"), "idem-1", Instant.parse("2026-09-28T10:00:00Z"));
    }

    @Test
    void sendsOrderPlacedToTheOrdersTopicKeyedByAccount() {
        when(kafkaTemplate.send(anyString(), anyString(), anyString()))
                .thenReturn(new CompletableFuture<>());

        publisher.publish(payload());

        verify(kafkaTemplate).send(eq("orders"), eq("1"), contains("\"eventType\":\"ORDER_PLACED\""));
    }

    @Test
    @SuppressWarnings("unchecked")
    void marksTheOrderPublishedOnceKafkaAcknowledges() {
        when(kafkaTemplate.send(anyString(), anyString(), anyString()))
                .thenReturn(CompletableFuture.completedFuture(mock(SendResult.class)));

        publisher.publish(payload());

        verify(orderMapper).markPublished(ORDER_UUID);
    }

    @Test
    void leavesTheOrderUnpublishedWhenTheSendFails() {
        when(kafkaTemplate.send(anyString(), anyString(), anyString()))
                .thenReturn(CompletableFuture.failedFuture(new IllegalStateException("broker down")));

        publisher.publish(payload());

        verify(orderMapper, never()).markPublished(any());
    }

    @Test
    void readsTheUuidOutOfAnOrdPrefixedId() {
        assertThat(OrderPlacedPublisher.orderUuidOf("ORD-" + ORDER_UUID)).isEqualTo(ORDER_UUID);
        assertThat(OrderPlacedPublisher.orderUuidOf(ORDER_UUID.toString())).isEqualTo(ORDER_UUID);
    }
}
