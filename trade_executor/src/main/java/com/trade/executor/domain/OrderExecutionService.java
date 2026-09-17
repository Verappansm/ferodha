package com.trade.executor.domain;

import com.trade.executor.currency.CurrencyConverter;
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
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Optional;
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
    private final CurrencyConverter currencyConverter;
    private final FeeCalculator feeCalculator;

    public OrderExecutionService(OrderMapper orderMapper, AccountMapper accountMapper,
                                  InstrumentMapper instrumentMapper, PositionMapper positionMapper,
                                  QuoteSource quoteSource, SettlementService settlementService,
                                  TradeEventPublisher tradeEventPublisher, CurrencyConverter currencyConverter,
                                  FeeCalculator feeCalculator) {
        this.orderMapper = orderMapper;
        this.accountMapper = accountMapper;
        this.instrumentMapper = instrumentMapper;
        this.positionMapper = positionMapper;
        this.quoteSource = quoteSource;
        this.settlementService = settlementService;
        this.tradeEventPublisher = tradeEventPublisher;
        this.currencyConverter = currencyConverter;
        this.feeCalculator = feeCalculator;
    }

    public void process(OrderPlacedPayload event) {
        UUID orderId = OrderIdCodec.parse(event.orderId());
        OrderRow order = orderMapper.findById(orderId)
                .orElseThrow(() -> new IllegalStateException(
                        "ORDER_PLACED references unknown order " + event.orderId()));

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
        BigDecimal tradeValueAccountCcy =
                currencyConverter.convert(tradeValueInstrumentCcy, instrument.currency(), account.currency());
        BigDecimal fee = MoneyRounding.toMoneyScale(feeCalculator.calculateFee(tradeValueAccountCcy));
        BigDecimal totalCashDelta = MoneyRounding.toMoneyScale(side == OrderSide.BUY
                ? tradeValueAccountCcy.add(fee)
                : tradeValueAccountCcy.subtract(fee));

        Optional<RejectionReason> postCheck = side == OrderSide.BUY
                ? ExecutionRuleCheck.checkAffordable(account, totalCashDelta)
                : ExecutionRuleCheck.checkHoldingsSufficient(
                        positionMapper.findHeldQuantity(account.accountUuid(), order.instrumentId()),
                        order.quantity());
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
}
