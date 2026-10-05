package com.trade.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trade.service.portfolio.LatestQuotes;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MarketDataListenerTest {

    private LatestQuotes latestQuotes;
    private MarketDataListener listener;

    @BeforeEach
    void setUp() {
        latestQuotes = new LatestQuotes();
        listener = new MarketDataListener(new ObjectMapper(), latestQuotes);
    }

    @Test
    @DisplayName("a quote is recorded at the mid of bid and ask, with its observation time")
    void recordsTheMidPrice() {
        listener.onQuote(message("AAPL", "99.00", "101.00", "\"2026-10-04T12:00:00Z\""));

        LatestQuotes.Quote quote = latestQuotes.find("AAPL").orElseThrow();
        assertEquals(0, new BigDecimal("100.00").compareTo(quote.price()));
        assertEquals(OffsetDateTime.parse("2026-10-04T12:00:00Z"), quote.asOf());
    }

    @Test
    @DisplayName("an asOf written as epoch seconds is read too")
    void readsEpochSecondTimestamps() {
        listener.onQuote(message("AAPL", "99.00", "101.00", "1791115200.5"));

        assertEquals(OffsetDateTime.parse("2026-10-04T12:00:00.5Z"), latestQuotes.find("AAPL").orElseThrow().asOf());
    }

    @Test
    @DisplayName("an older quote never replaces a newer one")
    void olderQuoteNeverWins() {
        listener.onQuote(message("AAPL", "110.00", "110.00", "\"2026-10-04T12:05:00Z\""));
        listener.onQuote(message("AAPL", "90.00", "90.00", "\"2026-10-04T12:00:00Z\""));

        assertEquals(0, new BigDecimal("110.00").compareTo(latestQuotes.find("AAPL").orElseThrow().price()));
    }

    @Test
    @DisplayName("an unreadable message is skipped, not thrown")
    void unreadableMessageIsSkipped() {
        listener.onQuote("not json");
        listener.onQuote("{\"payload\":{\"symbol\":\"AAPL\",\"asOf\":\"2026-10-04T12:00:00Z\"}}");

        assertTrue(latestQuotes.find("AAPL").isEmpty());
    }

    private static String message(String symbol, String bid, String ask, String asOf) {
        return """
                {"eventId":"e1","eventType":"MARKET_DATA_QUOTE","source":"trade-executor","schemaVersion":1,
                 "payload":{"symbol":"%s","bid":%s,"ask":%s,"currency":"USD","asOf":%s}}
                """.formatted(symbol, bid, ask, asOf);
    }
}
