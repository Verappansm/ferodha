package com.trade.executor.fauxnance;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class FauxnanceQuoteClientTest {

    private static final String QUOTE_JSON = """
            {"data":{"quote":{"symbol":"AAPL","price":100.25,"bid":99.00,"ask":100.50,"currency":"USD"}}}
            """;

    @Test
    @DisplayName("returns the quote on a first-attempt success")
    void returnsQuoteOnFirstSuccess() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://fauxnance.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        FauxnanceQuoteClient client = new FauxnanceQuoteClient(builder.build(), 3, 1);

        server.expect(requestTo("http://fauxnance.test/quotes/AAPL"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess(QUOTE_JSON, MediaType.APPLICATION_JSON));

        Optional<Quote> quote = client.fetchQuote("AAPL");

        assertTrue(quote.isPresent());
        assertEquals(0, new BigDecimal("99.00").compareTo(quote.get().bid()));
        assertEquals(0, new BigDecimal("100.50").compareTo(quote.get().ask()));
        server.verify();
    }

    @Test
    @DisplayName("retries a transient 5xx failure and then succeeds")
    void retriesTransientFailureThenSucceeds() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://fauxnance.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        FauxnanceQuoteClient client = new FauxnanceQuoteClient(builder.build(), 3, 1);

        server.expect(requestTo("http://fauxnance.test/quotes/AAPL")).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
        server.expect(requestTo("http://fauxnance.test/quotes/AAPL")).andRespond(withSuccess(QUOTE_JSON, MediaType.APPLICATION_JSON));

        Optional<Quote> quote = client.fetchQuote("AAPL");

        assertTrue(quote.isPresent());
        server.verify();
    }

    @Test
    @DisplayName("exhausts the retry budget and resolves to no price available")
    void exhaustsRetryBudgetAndReturnsEmpty() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://fauxnance.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        FauxnanceQuoteClient client = new FauxnanceQuoteClient(builder.build(), 3, 1);

        for (int i = 0; i < 3; i++) {
            server.expect(requestTo("http://fauxnance.test/quotes/AAPL")).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
        }

        Optional<Quote> quote = client.fetchQuote("AAPL");

        assertTrue(quote.isEmpty());
        server.verify();
    }

    @Test
    @DisplayName("a non-retryable 4xx fails immediately without burning the retry budget")
    void nonRetryable4xxFailsImmediately() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://fauxnance.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        FauxnanceQuoteClient client = new FauxnanceQuoteClient(builder.build(), 3, 1);

        // Only one request is stubbed; if the client retried a 404 it would
        // make a second call MockRestServiceServer has no expectation for,
        // and server.verify() (or the call itself) would fail.
        server.expect(requestTo("http://fauxnance.test/quotes/UNKNOWN")).andRespond(withStatus(HttpStatus.NOT_FOUND));

        Optional<Quote> quote = client.fetchQuote("UNKNOWN");

        assertTrue(quote.isEmpty());
        server.verify();
    }
}
