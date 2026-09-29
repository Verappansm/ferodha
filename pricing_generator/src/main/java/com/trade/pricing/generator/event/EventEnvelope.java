package com.trade.pricing.generator.event;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.time.Instant;
import java.util.UUID;

// Identical shape to trade_api's com.trade.event.EventEnvelope - the two are
// separate Maven projects so this is a deliberate copy, not a dependency
// (see the copy-not-depend convention noted throughout this package).
// ignoreUnknown so a future additive top-level field doesn't dead-letter
// this consumer (Story 1's "ignore fields you do not recognise" requirement).
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
