package com.trade.generator.orders;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trade.generator.client.GeneratorQuoteClient;
import com.trade.generator.fauxnance.Quote;
import com.trade.generator.mapper.InstrumentRow;
import com.trade.generator.mapper.MarketMakerAccountRow;
import com.trade.generator.mapper.OrderPlacementMapper;
import com.trade.generator.mapper.PollableSymbolMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.KafkaTemplate;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// Orchestration only, mocked mappers/Kafka - same style OrderBookMatcherTest
// already uses on the trade_executor side. Side/price/quantity are randomly
// drawn (see OrderGenerator), so assertions here check the invariant
// (quantity in range, price is one of the tick's own bid/ask), not an exact
// value.
class OrderGeneratorTest {

    private static final UUID INSTRUMENT_ID = UUID.randomUUID();
    private static final MarketMakerAccountRow MARKET_MAKER =
            new MarketMakerAccountRow(UUID.randomUUID(), 99L, UUID.randomUUID());
    private static final Quote TICK = new Quote("AAPL", new BigDecimal("99.00"), new BigDecimal("100.00"), "USD");

    private final PollableSymbolMapper symbolMapper = mock(PollableSymbolMapper.class);
    private final OrderPlacementMapper orderPlacementMapper = mock(OrderPlacementMapper.class);
    private final GeneratorQuoteClient quoteClient = mock(GeneratorQuoteClient.class);
    @SuppressWarnings("unchecked")
    private final KafkaTemplate<String, String> kafkaTemplate = mock(KafkaTemplate.class);
    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    @BeforeEach
    void setUp() {
        when(orderPlacementMapper.findMarketMaker(anyString())).thenReturn(Optional.of(MARKET_MAKER));
        when(orderPlacementMapper.findInstrumentBySymbol("AAPL")).thenReturn(
                Optional.of(new InstrumentRow(INSTRUMENT_ID, "USD")));
        when(quoteClient.fetchQuote("AAPL")).thenReturn(Optional.of(TICK));
    }

    private OrderGenerator generator(double probability) {
        return new OrderGenerator(symbolMapper, orderPlacementMapper, quoteClient, kafkaTemplate,
                objectMapper, "orders", probability, 1, 20);
    }

    @Test
    @DisplayName("places an order priced at the tick's own bid or ask, quantity within the configured range")
    void placesOrderWithinConfiguredBounds() {
        when(symbolMapper.findPollableSymbols()).thenReturn(List.of("AAPL"));
        OrderGenerator generator = generator(1.0);

        generator.generate();

        verify(orderPlacementMapper).insertOrder(any(), eq(MARKET_MAKER.userId()), eq(MARKET_MAKER.accountUuid()),
                eq(INSTRUMENT_ID), any(), anyInt(), any(), anyString());
        verify(kafkaTemplate).send(eq("orders"), eq(String.valueOf(MARKET_MAKER.accountId())), anyString());
    }

    @Test
    @DisplayName("quantity/price stay within the tick's bid-ask and the configured quantity range across many draws")
    void repeatedDrawsStayInBounds() {
        when(symbolMapper.findPollableSymbols()).thenReturn(List.of("AAPL"));
        OrderGenerator generator = generator(1.0);

        for (int i = 0; i < 50; i++) {
            generator.generate();
        }

        verify(orderPlacementMapper, org.mockito.Mockito.atLeast(50)).insertOrder(
                any(), any(), any(), any(), any(),
                org.mockito.ArgumentMatchers.intThat(q -> q >= 1 && q <= 20),
                org.mockito.ArgumentMatchers.argThat((BigDecimal price) ->
                        price.compareTo(TICK.bid()) == 0 || price.compareTo(TICK.ask()) == 0),
                anyString());
    }

    @Test
    @DisplayName("a symbol with no tick yet is skipped, not guessed at")
    void skipsSymbolWithNoTickYet() {
        when(symbolMapper.findPollableSymbols()).thenReturn(List.of("MSFT"));
        when(quoteClient.fetchQuote("MSFT")).thenReturn(Optional.empty());
        OrderGenerator generator = generator(1.0);

        generator.generate();

        verify(orderPlacementMapper, never()).insertOrder(any(), any(), any(), any(), any(), anyInt(), any(), any());
    }

    @Test
    @DisplayName("no market-maker account resolved yet means no work at all, for any symbol")
    void skipsEverythingWithNoMarketMaker() {
        when(orderPlacementMapper.findMarketMaker(anyString())).thenReturn(Optional.empty());
        when(symbolMapper.findPollableSymbols()).thenReturn(List.of("AAPL"));
        OrderGenerator generator = generator(1.0);

        generator.generate();

        verify(symbolMapper, never()).findPollableSymbols();
        verify(orderPlacementMapper, never()).insertOrder(any(), any(), any(), any(), any(), anyInt(), any(), any());
    }

    @Test
    @DisplayName("zero probability never generates an order")
    void zeroProbabilityNeverGenerates() {
        when(symbolMapper.findPollableSymbols()).thenReturn(List.of("AAPL"));
        OrderGenerator generator = generator(0.0);

        generator.generate();

        verify(orderPlacementMapper, never()).insertOrder(any(), any(), any(), any(), any(), anyInt(), any(), any());
    }

    @Test
    @DisplayName("sanity: the tick's bid and ask really are distinct so the price assertion above is meaningful")
    void tickBidAskAreDistinct() {
        assertTrue(TICK.bid().compareTo(TICK.ask()) != 0);
    }
}
