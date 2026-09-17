package com.trade.event;

import java.time.Instant;
import java.util.UUID;

// The 5-field envelope every message on orders/trade-events carries,
// regardless of what's in payload. schemaVersion lets a consumer refuse a
// shape it doesn't understand instead of guessing.
public record EventEnvelope<T>(
        UUID eventId,
        String eventType,
        Instant eventTime,
        String source,
        int schemaVersion,
        T payload
) {
    public static <T> EventEnvelope<T> of(String eventType, String source, T payload) {
        return new EventEnvelope<>(UUID.randomUUID(), eventType, Instant.now(), source, 1, payload);
    }
}
