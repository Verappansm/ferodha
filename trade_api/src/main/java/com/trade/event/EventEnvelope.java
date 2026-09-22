package com.trade.event;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.time.Instant;
import java.util.UUID;

// The 5-field envelope every message on orders/trade-events carries,
// regardless of what's in payload. schemaVersion lets a consumer refuse a
// shape it doesn't understand instead of guessing. ignoreUnknown so a future
// additive top-level field (e.g. correlationId) doesn't dead-letter every
// consumer that hasn't been updated to know about it yet (Story 1's own
// "write consumers that ignore fields they do not recognise" requirement).
@JsonIgnoreProperties(ignoreUnknown = true)
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
