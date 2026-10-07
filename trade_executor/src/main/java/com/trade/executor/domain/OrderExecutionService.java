package com.trade.executor.domain;

import com.trade.executor.consumer.PoisonMessageException;
import com.trade.executor.currency.ApiSuppliedRates;
import com.trade.executor.enums.OrderSide;
import com.trade.executor.event.OrderPlacedPayload;
import com.trade.executor.event.TradeEventPublisher;
import com.trade.executor.fauxnance.Quote;
import com.trade.executor.fauxnance.QuoteSource;
import com.trade.executor.fee.FeeCalculator;
import com.trade.executor.mapper.AccountMapper;
import com.trade.executor.mapper.AccountRow;
import com.trade.executor.mapper.InstrumentMapper;
import com.trade.executor.mapper.InstrumentRow;
import com.trade.executor.mapper.OrderMapper;
import com.trade.executor.mapper.OrderRow;
import com.trade.executor.mapper.PositionMapper;
import com.trade.executor.pricing.FillDecision;
import com.trade.executor.pricing.FillRule;
import com.trade.executor.pricing.OrderForPricing;
import com.trade.executor.pricing.QuoteForPricing;
import com.trade.executor.settlement.SettlementOutcome;
import com.trade.executor.settlement.SettlementService;
import com.trade.executor.util.MoneyRounding;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.Map;
import java.util.UUID;

// Orchestrates one ORDER_PLACED event end to end: load, re-check, price,
// settle, publish. Deliberately NOT @Transactional - pricing means a
// Fauxnance network round trip, and holding a DB connection open across
// that call would be bad practice. SettlementService's two methods are the
// only transactional boundaries; because they return (commit) before this
// class calls TradeEventPublisher, "publish after commit" falls out of
// ordinary method-return ordering with no manual synchronization needed.
@Service
public class OrderExecutionService {

    private static final Logger log = LoggerFactory.getLogger(OrderExecutionService.class);

    private final OrderMapper orderMapper;
    private final AccountMapper accountMapper;
    private final InstrumentMapper instrumentMapper;
    private final PositionMapper positionMapper;
    private final QuoteSource quoteSource;
    private final SettlementService settlementService;
    private final TradeEventPublisher tradeEventPublisher;
    private final FeeCalculator feeCalculator;
    private final OrderBookMatcher orderBookMatcher;
    private final boolean matchingEnabled;

    public OrderExecutionService(OrderMapper orderMapper, AccountMapper accountMapper,
                                  InstrumentMapper instrumentMapper, PositionMapper positionMapper,
                                  QuoteSource quoteSource, SettlementService settlementService,
                                  TradeEventPublisher tradeEventPublisher,
                                  FeeCalculator feeCalculator, OrderBookMatcher orderBookMatcher,
                                  @Value("${executor.matching.enabled:false}") boolean matchingEnabled) {
        this.orderMapper = orderMapper;
        this.accountMapper = accountMapper;
        this.instrumentMapper = instrumentMapper;
        this.positionMapper = positionMapper;
        this.quoteSource = quoteSource;
        this.settlementService = settlementService;
        this.tradeEventPublisher = tradeEventPublisher;
        this.feeCalculator = feeCalculator;
        this.orderBookMatcher = orderBookMatcher;
        this.matchingEnabled = matchingEnabled;
    }

    public void process(OrderPlacedPayload event) {
        UUID orderId;
        try {
            orderId = OrderIdCodec.parse(event.orderId());
        } catch (IllegalArgumentException e) {
            // Never parses no matter how many times it's retried.
            throw new PoisonMessageException("Unparseable order id: " + event.orderId(), e);
        }
        // An order this old-yet-still-referenced-by-Kafka can't exist means
        // the message is bad data, not a transient lookup failure - the
        // insert into Orders always commits before ORDER_PLACED is
        // published (see trade_api's OrderController), so retrying a
        // genuinely missing order will never make it appear.
        OrderRow order = orderMapper.findById(orderId)
                .orElseThrow(() -> new PoisonMessageException(
                        "ORDER_PLACED references an order id not in Postgres: " + event.orderId()));

        // Cheap skip-ahead for an obvious redelivery - NOT the correctness
        // guard. Even without this check, a genuine duplicate still reaches
        // SettlementService's conditional UPDATE, gets zero rows affected,
        // and stops there just the same.
        if (!"NEW".equals(order.status())) {
            log.info("Order {} is already {} - skipping re-processing", order.orderId(), order.status());
            return;
        }

        InstrumentRow instrument = instrumentMapper.findById(order.instrumentId())
                .orElseThrow(() -> new IllegalStateException(
                        "Order " + order.orderId() + " references unknown instrument " + order.instrumentId()));
        AccountRow account = accountMapper.findById(order.accountId())
                .orElseThrow(() -> new IllegalStateException(
                        "Order " + order.orderId() + " references unknown account " + order.accountId()));

        Optional<RejectionReason> preCheck = ExecutionRuleCheck.checkInstrumentTradable(instrument)
                .or(() -> ExecutionRuleCheck.checkAccountActive(account));
        if (preCheck.isPresent()) {
            settleAndPublishReject(order, preCheck.get());
            return;
        }

        // The rates travel on the message and never change on redelivery,
        // so a missing one is poison: dead-letter now, before anything is
        // settled, rather than retry or fail half-way through a match walk.
        if (!ApiSuppliedRates.hasRate(account.currency(), event.instrumentToAccountRates())) {
            throw new PoisonMessageException("ORDER_PLACED " + event.orderId()
                    + " carries no trade_api FX rate for account currency " + account.currency());
        }

        if (matchingEnabled) {
            processWithMatching(order, account, event.instrumentToAccountRates());
            return;
        }

        Optional<Quote> quote = quoteSource.fetchQuote(order.symbol());
        if (quote.isEmpty()) {
            settleAndPublishReject(order, RejectionReason.PRICE_UNAVAILABLE);
            return;
        }

        OrderSide side = OrderSide.valueOf(order.side());
        FillDecision decision = FillRule.decide(
                new OrderForPricing(side, order.limitPrice()),
                new QuoteForPricing(quote.get().bid(), quote.get().ask()));

        if (decision instanceof FillDecision.Reject reject) {
            settleAndPublishReject(order, reject.reason());
            return;
        }
        BigDecimal executedPrice = MoneyRounding.toMoneyScale(((FillDecision.Fill) decision).settlementPrice());

        BigDecimal tradeValueInstrumentCcy = executedPrice.multiply(BigDecimal.valueOf(order.quantity()));
        BigDecimal tradeValueAccountCcy = ApiSuppliedRates.apply(
                tradeValueInstrumentCcy, account.currency(), event.instrumentToAccountRates());
        BigDecimal fee = MoneyRounding.toMoneyScale(feeCalculator.calculateFee(tradeValueAccountCcy, order.feeRate()));
        BigDecimal totalCashDelta = MoneyRounding.toMoneyScale(side == OrderSide.BUY
                ? tradeValueAccountCcy.add(fee)
                : tradeValueAccountCcy.subtract(fee));

        Optional<RejectionReason> postCheck = side == OrderSide.SELL
                ? ExecutionRuleCheck.checkHoldingsSufficient(
                        positionMapper.findHeldQuantity(account.accountUuid(), order.instrumentId()),
                        order.quantity())
                : Optional.empty();
        if (postCheck.isPresent()) {
            settleAndPublishReject(order, postCheck.get());
            return;
        }

        SettlementOutcome outcome = settlementService.settleFill(
                order, account, executedPrice, order.quantity(), fee, totalCashDelta, side);
        if (outcome.result() == SettlementOutcome.Result.ALREADY_PROCESSED) {
            log.info("Order {} was already settled by a prior delivery - not republishing", order.orderId());
            return;
        }
        tradeEventPublisher.publishFilled(order, executedPrice, fee);
    }

    private void settleAndPublishReject(OrderRow order, RejectionReason reason) {
        SettlementOutcome outcome = settlementService.settleReject(order, reason);
        if (outcome.result() == SettlementOutcome.Result.ALREADY_PROCESSED) {
            log.info("Order {} was already resolved by a prior delivery - not republishing", order.orderId());
            return;
        }
        tradeEventPublisher.publishRejected(order, reason);
    }

    // Only reached when executor.matching.enabled is true. Matches against
    // the resting book first; whatever crosses is settled and published
    // (FILLED or PARTIALLY_FILLED). Whatever doesn't cross simply rests -
    // no quote fetch, no FillRule, no rejection path here. A limit order
    // that finds no counterparty is exactly what a real exchange's order
    // book does with one too: nothing happens until something crosses it.
    private void processWithMatching(OrderRow order, AccountRow account,
                                     Map<String, BigDecimal> instrumentToAccountRates) {
        // Re-check SELL holdings before matching. Buy affordability was
        // checked in trade_api before this order was accepted.
        OrderSide side = OrderSide.valueOf(order.side());
        int remainingQuantity = order.remainingQuantity();
        Optional<RejectionReason> preCheck = side == OrderSide.SELL
                ? ExecutionRuleCheck.checkHoldingsSufficient(
                        positionMapper.findHeldQuantity(account.accountUuid(), order.instrumentId()), remainingQuantity)
                : Optional.empty();
        if (preCheck.isPresent()) {
            settleAndPublishReject(order, preCheck.get());
            return;
        }

        OrderBookMatcher.Result result = orderBookMatcher.match(order, account, instrumentToAccountRates);
        if (!result.matchedAnything()) {
            log.info("Order {} found no crossing liquidity - resting at {}", order.orderId(), order.status());
            return;
        }

        int totalFilled = order.filledQuantity() + result.totalMatched();
        String newStatus = totalFilled >= order.quantity() ? "FILLED" : "PARTIALLY_FILLED";

        SettlementOutcome outcome = settlementService.finalizeIncomingOrder(
                order, result.totalMatched(), result.lastExecutionPrice(), newStatus, result.totalFee());
        if (outcome.result() == SettlementOutcome.Result.ALREADY_PROCESSED) {
            log.info("Order {} was already settled by a prior delivery - not republishing", order.orderId());
            return;
        }

        if ("FILLED".equals(newStatus)) {
            tradeEventPublisher.publishFilled(order, result.lastExecutionPrice(), result.totalFee());
        } else {
            tradeEventPublisher.publishPartiallyFilled(order, result.lastExecutionPrice(), result.totalFee());
        }
    }

}
