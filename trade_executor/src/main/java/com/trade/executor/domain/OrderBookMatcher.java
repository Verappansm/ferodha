package com.trade.executor.domain;

import com.trade.executor.settlement.InsufficientFundsAtSettlementException;
import com.trade.executor.currency.ApiSuppliedRates;
import com.trade.executor.enums.OrderSide;
import com.trade.executor.event.TradeEventPublisher;
import com.trade.executor.fee.FeeCalculator;
import com.trade.executor.mapper.AccountMapper;
import com.trade.executor.mapper.AccountRow;
import com.trade.executor.mapper.OrderMapper;
import com.trade.executor.mapper.OrderRow;
import com.trade.executor.mapper.PositionMapper;
import com.trade.executor.settlement.MatchOutcome;
import com.trade.executor.settlement.SettlementService;
import com.trade.executor.util.MoneyRounding;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.Map;

// Only ever consulted when executor.matching.enabled is true. Walks
// resting opposite-side liquidity on the incoming order's instrument,
// price-then-time priority, matching as much as is available at each
// price level before moving to the next. Every individual match is its
// own small transaction (SettlementService.settleMatch) - this class
// coordinates the walk and applies API-supplied FX rates to fee math (the
// same division of labour OrderExecutionService already has with
// SettlementService for the non-matching path), it never touches the
// database directly beyond the read-only candidate/position queries.
//
// Execution price is always the resting order's own limit_price ("price
// improvement", the way a real exchange's price-time priority actually
// works: whichever order was already resting sets the trade price, and
// the newer crossing order takes it, never worse than its own limit).
// Every order in this codebase is a LIMIT order - there's no market-order
// case where "the incoming order's own price" would ever be the right
// answer instead.
@Component
public class OrderBookMatcher {

    private static final Logger log = LoggerFactory.getLogger(OrderBookMatcher.class);

    private final OrderMapper orderMapper;
    private final AccountMapper accountMapper;
    private final PositionMapper positionMapper;
    private final SettlementService settlementService;
    private final FeeCalculator feeCalculator;
    private final TradeEventPublisher tradeEventPublisher;

    public OrderBookMatcher(OrderMapper orderMapper, AccountMapper accountMapper, PositionMapper positionMapper,
                             SettlementService settlementService,
                             FeeCalculator feeCalculator, TradeEventPublisher tradeEventPublisher) {
        this.orderMapper = orderMapper;
        this.accountMapper = accountMapper;
        this.positionMapper = positionMapper;
        this.settlementService = settlementService;
        this.feeCalculator = feeCalculator;
        this.tradeEventPublisher = tradeEventPublisher;
    }

    public record Result(int totalMatched, BigDecimal lastExecutionPrice, BigDecimal totalFee) {
        public boolean matchedAnything() {
            return totalMatched > 0;
        }
    }

    public Result match(OrderRow incoming, AccountRow incomingAccount,
                        Map<String, BigDecimal> instrumentToAccountRates) {
        OrderSide incomingSide = OrderSide.valueOf(incoming.side());
        String oppositeSide = incomingSide == OrderSide.BUY ? "SELL" : "BUY";

        int remaining = incoming.remainingQuantity();
        int totalMatched = 0;
        BigDecimal lastExecutionPrice = null;
        BigDecimal totalIncomingFee = BigDecimal.ZERO;

        while (remaining > 0) {
            List<OrderRow> candidates = orderMapper.findRestingOpposite(
                    incoming.instrumentId(), oppositeSide, incoming.limitPrice(), incoming.orderId());
            if (candidates.isEmpty()) {
                break;
            }

            boolean progressedThisPass = false;
            for (OrderRow resting : candidates) {
                if (remaining <= 0) {
                    break;
                }
                int restingRemaining = resting.remainingQuantity();
                if (restingRemaining <= 0) {
                    continue;
                }

                int matchQuantity = Math.min(remaining, restingRemaining);
                BigDecimal executionPrice = resting.limitPrice();
                OrderSide restingSide = OrderSide.valueOf(resting.side());
                String restingNewStatus = (resting.filledQuantity() + matchQuantity >= resting.quantity())
                        ? "FILLED" : "PARTIALLY_FILLED";

                AccountRow restingAccount = accountMapper.findById(resting.accountId())
                        .orElseThrow(() -> new IllegalStateException(
                                "Resting order " + resting.orderId() + " references unknown account " + resting.accountId()));

                // Skipped, never thrown: earlier matches in this walk have
                // already committed, and failing here would leave the
                // incoming order un-finalized for a redelivery to re-match.
                if (!ApiSuppliedRates.hasRate(restingAccount.currency(), instrumentToAccountRates)) {
                    log.info("Resting order {} is in {}, which has no API-supplied rate - skipping",
                            resting.orderId(), restingAccount.currency());
                    continue;
                }

                // Cash and holdings can change after placement, so verify a
                // resting buy can still pay, or a resting sell still has its
                // shares, before matching.
                BigDecimal restingTradeValue = ApiSuppliedRates.apply(
                        executionPrice.multiply(BigDecimal.valueOf(matchQuantity)), restingAccount.currency(), instrumentToAccountRates);
                BigDecimal restingFee = MoneyRounding.toMoneyScale(feeCalculator.calculateFee(restingTradeValue, resting.feeRate()));
                Optional<RejectionReason> restingCheck = restingSide == OrderSide.BUY
                        ? ExecutionRuleCheck.checkAffordable(restingAccount, MoneyRounding.toMoneyScale(restingTradeValue.add(restingFee)))
                        : ExecutionRuleCheck.checkHoldingsSufficient(
                                positionMapper.findHeldQuantity(restingAccount.accountUuid(), resting.instrumentId()), matchQuantity);
                if (restingCheck.isPresent()) {
                    log.info("Resting order {} can no longer be honoured ({}) - skipping",
                            resting.orderId(), restingCheck.get());
                    continue;
                }

                BigDecimal incomingTradeValue = ApiSuppliedRates.apply(
                        executionPrice.multiply(BigDecimal.valueOf(matchQuantity)), incomingAccount.currency(), instrumentToAccountRates);
                BigDecimal incomingFee = MoneyRounding.toMoneyScale(feeCalculator.calculateFee(incomingTradeValue, incoming.feeRate()));

                BigDecimal restingCashDelta = MoneyRounding.toMoneyScale(restingSide == OrderSide.BUY
                        ? restingTradeValue.add(restingFee) : restingTradeValue.subtract(restingFee));
                BigDecimal incomingCashDelta = MoneyRounding.toMoneyScale(incomingSide == OrderSide.BUY
                        ? incomingTradeValue.add(incomingFee) : incomingTradeValue.subtract(incomingFee));

                MatchOutcome outcome;
                try {
                    outcome = settlementService.settleMatch(
                            resting, restingAccount, restingSide, restingCashDelta, restingFee,
                            incoming, incomingAccount, incomingSide, incomingCashDelta,
                            matchQuantity, executionPrice, restingNewStatus);
                } catch (InsufficientFundsAtSettlementException e) {
                    // One side's cash went under the match; it rolled back, nothing moved.
                    log.info("Match of resting order {} skipped: {}", resting.orderId(), e.getMessage());
                    continue;
                }

                if (outcome.result() == MatchOutcome.Result.CONTENDED) {
                    log.info("Resting order {} was matched by a concurrent delivery first - skipping", resting.orderId());
                    continue;
                }

                // The resting side gets its own trade-events publish here,
                // per match, same as the incoming side gets one at the end
                // of its own walk - previously only the incoming order ever
                // published anything, leaving the resting account with no
                // way to learn their order filled short of polling order
                // history directly.
                if ("FILLED".equals(restingNewStatus)) {
                    tradeEventPublisher.publishFilled(resting, executionPrice, restingFee);
                } else {
                    tradeEventPublisher.publishPartiallyFilled(resting, executionPrice, restingFee);
                }

                remaining -= matchQuantity;
                totalMatched += matchQuantity;
                totalIncomingFee = totalIncomingFee.add(incomingFee);
                lastExecutionPrice = executionPrice;
                progressedThisPass = true;
            }

            if (!progressedThisPass) {
                // Every candidate in this pass was contended or could no
                // longer be honoured - rather than spin re-querying the
                // same rows, leave the rest resting for whatever processes
                // this order (or the next one) next.
                break;
            }
        }

        return new Result(totalMatched, lastExecutionPrice, MoneyRounding.toMoneyScale(totalIncomingFee));
    }

}
