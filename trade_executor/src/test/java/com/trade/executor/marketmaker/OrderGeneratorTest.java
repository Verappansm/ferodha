package com.trade.executor.marketmaker;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trade.executor.ticker.CurrentTickStore;
import com.trade.executor.ticker.fauxnance.Quote;
import com.trade.executor.mapper.marketmaker.InstrumentRow;
import com.trade.executor.mapper.marketmaker.MarketMakerAccountRow;
import com.trade.executor.mapper.marketmaker.OrderPlacementMapper;
import com.trade.executor.mapper.PollableSymbolMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.KafkaTemplate;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
    private final CurrentTickStore tickStore = mock(CurrentTickStore.class);
    @SuppressWarnings("unchecked")
    private final KafkaTemplate<String, String> kafkaTemplate = mock(KafkaTemplate.class);
    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    @BeforeEach
    void setUp() {
        when(orderPlacementMapper.findMarketMaker(anyString())).thenReturn(Optional.of(MARKET_MAKER));
        when(orderPlacementMapper.findInstrumentBySymbol("AAPL")).thenReturn(
                Optional.of(new InstrumentRow(INSTRUMENT_ID, "USD")));
        when(tickStore.get("AAPL")).thenReturn(Optional.of(TICK));
    }

    private OrderGenerator generator(double probability) {
        return new OrderGenerator(symbolMapper, orderPlacementMapper, tickStore, kafkaTemplate,
                objectMapper, "orders", probability, 1, 20);
    }

    @Test
    @DisplayName("places an order priced at the tick's own bid or ask, quantity within the configured range")
    void placesOrderWithinConfiguredBounds() {
        when(symbolMapper.findTradableHeldOrWatchedSymbols()).thenReturn(List.of("AAPL"));
        OrderGenerator generator = generator(1.0);

        generator.generate();

        verify(orderPlacementMapper).insertOrder(any(), eq(MARKET_MAKER.userId()), eq(MARKET_MAKER.accountUuid()),
                eq(INSTRUMENT_ID), any(), anyInt(), any(), anyString());
        verify(kafkaTemplate).send(eq("orders"), eq(String.valueOf(MARKET_MAKER.accountId())), anyString());
    }

    @Test
    @DisplayName("quantity/price stay within the tick's bid-ask and the configured quantity range across many draws")
    void repeatedDrawsStayInBounds() {
        when(symbolMapper.findTradableHeldOrWatchedSymbols()).thenReturn(List.of("AAPL"));
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
        when(symbolMapper.findTradableHeldOrWatchedSymbols()).thenReturn(List.of("MSFT"));
        when(tickStore.get("MSFT")).thenReturn(Optional.empty());
        OrderGenerator generator = generator(1.0);

        generator.generate();

        verify(orderPlacementMapper, never()).insertOrder(any(), any(), any(), any(), any(), anyInt(), any(), any());
    }

    @Test
    @DisplayName("no market-maker account resolved yet means no work at all, for any symbol")
    void skipsEverythingWithNoMarketMaker() {
        when(orderPlacementMapper.findMarketMaker(anyString())).thenReturn(Optional.empty());
        when(symbolMapper.findTradableHeldOrWatchedSymbols()).thenReturn(List.of("AAPL"));
        OrderGenerator generator = generator(1.0);

        generator.generate();

        verify(symbolMapper, never()).findTradableHeldOrWatchedSymbols();
        verify(orderPlacementMapper, never()).insertOrder(any(), any(), any(), any(), any(), anyInt(), any(), any());
    }

    @Test
    @DisplayName("zero probability never generates an order")
    void zeroProbabilityNeverGenerates() {
        when(symbolMapper.findTradableHeldOrWatchedSymbols()).thenReturn(List.of("AAPL"));
        OrderGenerator generator = generator(0.0);

        generator.generate();

        verify(orderPlacementMapper, never()).insertOrder(any(), any(), any(), any(), any(), anyInt(), any(), any());
    }

    @Test
    @DisplayName("every ORDER_PLACED carries the FX rates the executor needs for the account currency")
    void messageCarriesFxRates() throws Exception {
        when(symbolMapper.findTradableHeldOrWatchedSymbols()).thenReturn(List.of("AAPL"));
        generator(1.0).generate();

        org.mockito.ArgumentCaptor<String> json = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(eq("orders"), anyString(), json.capture());
        var rates = objectMapper.readTree(json.getValue()).path("payload").path("instrumentToAccountRates");
        assertEquals(0, new BigDecimal("1").compareTo(rates.path("USD").decimalValue()));
        assertEquals(0, new BigDecimal("90").compareTo(rates.path("INR").decimalValue()));
    }

    @Test
    @DisplayName("an INR instrument carries 1 for INR and 1/90 for USD")
    void inrInstrumentRates() throws Exception {
        when(symbolMapper.findTradableHeldOrWatchedSymbols()).thenReturn(List.of("INFY.NS"));
        when(orderPlacementMapper.findInstrumentBySymbol("INFY.NS")).thenReturn(
                Optional.of(new InstrumentRow(INSTRUMENT_ID, "INR")));
        when(tickStore.get("INFY.NS")).thenReturn(Optional.of(
                new Quote("INFY.NS", new BigDecimal("1500.00"), new BigDecimal("1501.00"), "INR")));
        generator(1.0).generate();

        org.mockito.ArgumentCaptor<String> json = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(eq("orders"), anyString(), json.capture());
        var rates = objectMapper.readTree(json.getValue()).path("payload").path("instrumentToAccountRates");
        assertEquals(0, BigDecimal.ONE.compareTo(rates.path("INR").decimalValue()));
        assertEquals(1.0 / 90, rates.path("USD").asDouble(), 1e-12);
    }

    @Test
    @DisplayName("an instrument priced in a currency with no rate is left alone: no order, no message")
    void unsupportedCurrencySkipped() {
        when(symbolMapper.findTradableHeldOrWatchedSymbols()).thenReturn(List.of("SAP.DE"));
        when(orderPlacementMapper.findInstrumentBySymbol("SAP.DE")).thenReturn(
                Optional.of(new InstrumentRow(INSTRUMENT_ID, "EUR")));
        when(tickStore.get("SAP.DE")).thenReturn(Optional.of(
                new Quote("SAP.DE", new BigDecimal("100"), new BigDecimal("101"), "EUR")));
        generator(1.0).generate();

        verify(orderPlacementMapper, never()).insertOrder(any(), any(), any(), any(), any(), anyInt(), any(), any());
        verify(kafkaTemplate, never()).send(anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("sanity: the tick's bid and ask really are distinct so the price assertion above is meaningful")
    void tickBidAskAreDistinct() {
        assertTrue(TICK.bid().compareTo(TICK.ask()) != 0);
    }
}
