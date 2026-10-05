package com.trade.generator.orders;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trade.generator.client.GeneratorQuoteClient;
import com.trade.generator.event.EventEnvelope;
import com.trade.generator.fauxnance.Quote;
import com.trade.generator.mapper.InstrumentRow;
import com.trade.generator.mapper.MarketMakerAccountRow;
import com.trade.generator.mapper.OrderPlacementMapper;
import com.trade.generator.mapper.PollableSymbolMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Optional;
import java.util.Random;
import java.util.UUID;

// The synthetic counterparty side of market-sim: places real Orders rows
// (source RANDOMIZER) through the seeded market-maker account (see
// trade_api's 006-market-maker-account.sql) and publishes ORDER_PLACED the
// same way trade_api's own OrderController does, so trade_executor's
// existing OrderPlacedListener/OrderExecutionService/OrderBookMatcher path
// needs no changes at all to consume one - a synthetic order is simply
// another resting order in the book once it lands.
//
// Priced off the pricing service's latest tick (fetched over HTTP per
// symbol - see GeneratorQuoteClient), quoted right at the current touch
// (BUY at the tick's bid, SELL at its ask) so a portal order that crosses
// the spread has a genuine chance to match it, the same way a resting quote
// at the inside market would in a real book.
@Component
@Profile("market-sim")
public class OrderGenerator {

    private static final Logger log = LoggerFactory.getLogger(OrderGenerator.class);
    private static final String MARKET_MAKER_BUSINESS_REF = "ACC-MARKET-MAKER";

    private final PollableSymbolMapper symbolMapper;
    private final OrderPlacementMapper orderPlacementMapper;
    private final GeneratorQuoteClient quoteClient;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;
    private final String ordersTopic;
    private final double probabilityPerSymbol;
    private final int minQuantity;
    private final int maxQuantity;
    private final Random random = new Random();

    private volatile MarketMakerAccountRow marketMaker;

    public OrderGenerator(PollableSymbolMapper symbolMapper, OrderPlacementMapper orderPlacementMapper,
                           GeneratorQuoteClient quoteClient, KafkaTemplate<String, String> kafkaTemplate,
                           ObjectMapper objectMapper,
                           @Value("${kafka.topics.orders:orders}") String ordersTopic,
                           @Value("${generator.orders.probability:0.3}") double probabilityPerSymbol,
                           @Value("${generator.orders.min-quantity:1}") int minQuantity,
                           @Value("${generator.orders.max-quantity:20}") int maxQuantity) {
        this.symbolMapper = symbolMapper;
        this.orderPlacementMapper = orderPlacementMapper;
        this.quoteClient = quoteClient;
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
        this.ordersTopic = ordersTopic;
        this.probabilityPerSymbol = probabilityPerSymbol;
        this.minQuantity = minQuantity;
        this.maxQuantity = maxQuantity;
    }

    @Scheduled(fixedRateString = "${generator.orders.interval-seconds:10}000", initialDelayString = "10000")
    void generate() {
        Optional<MarketMakerAccountRow> account = resolveMarketMaker();
        if (account.isEmpty()) {
            log.warn("Market-maker account '{}' not found - has trade_api's Liquibase migration run yet?",
                    MARKET_MAKER_BUSINESS_REF);
            return;
        }

        for (String symbol : symbolMapper.findPollableSymbols()) {
            if (random.nextDouble() < probabilityPerSymbol) {
                generateOne(symbol, account.get());
            }
        }
    }

    private Optional<MarketMakerAccountRow> resolveMarketMaker() {
        // Resolved once and cached - a seeded row that never changes, and
        // re-querying it every tick for every symbol would be pure waste.
        if (marketMaker == null) {
            marketMaker = orderPlacementMapper.findMarketMaker(MARKET_MAKER_BUSINESS_REF).orElse(null);
        }
        return Optional.ofNullable(marketMaker);
    }

    private void generateOne(String symbol, MarketMakerAccountRow account) {
        Optional<Quote> tick = quoteClient.fetchQuote(symbol);
        if (tick.isEmpty()) {
            return;
        }
        Optional<InstrumentRow> instrument = orderPlacementMapper.findInstrumentBySymbol(symbol);
        if (instrument.isEmpty()) {
            return;
        }

        boolean isBuy = random.nextBoolean();
        String side = isBuy ? "BUY" : "SELL";
        var price = isBuy ? tick.get().bid() : tick.get().ask();
        int quantity = minQuantity + random.nextInt(maxQuantity - minQuantity + 1);
        UUID orderId = UUID.randomUUID();
        String idempotencyKey = "RANDOMIZER-" + UUID.randomUUID();

        orderPlacementMapper.insertOrder(orderId, account.userId(), account.accountUuid(),
                instrument.get().instrumentId(), side, quantity, price, idempotencyKey);

        OrderPlacedPayload payload = new OrderPlacedPayload(
                "ORD-" + orderId, account.accountId(), symbol, side, quantity, price, idempotencyKey, Instant.now());
        EventEnvelope<OrderPlacedPayload> envelope = EventEnvelope.of("ORDER_PLACED", "trades-generator", payload);
        try {
            String json = objectMapper.writeValueAsString(envelope);
            kafkaTemplate.send(ordersTopic, String.valueOf(account.accountId()), json);
        } catch (Exception e) {
            // The Orders row already committed above even if this publish
            // fails - same "an unpublished but placed order can be
            // recovered by replaying the order table" reasoning
            // OrderController's own comment already documents; a lost
            // publish here just means this one resting order sits
            // unmatched until the next cycle's orders cross it directly,
            // not a correctness problem.
            log.warn("Failed to publish synthetic ORDER_PLACED for {}: {}", symbol, e.getMessage());
        }
    }
}
