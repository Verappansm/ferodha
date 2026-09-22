package com.trade.executor.domain;

import com.trade.executor.enums.OrderSide;
import com.trade.executor.mapper.AccountMapper;
import com.trade.executor.mapper.AccountRow;
import com.trade.executor.mapper.OrderMapper;
import com.trade.executor.mapper.OrderRow;
import com.trade.executor.settlement.MatchOutcome;
import com.trade.executor.settlement.SettlementService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.List;

// Only ever consulted when executor.matching.enabled is true. Walks
// resting opposite-side liquidity on the incoming order's instrument,
// price-then-time priority, matching as much as is available at each
// price level before moving to the next. Every individual match is its
// own small transaction (SettlementService.settleMatch) - this class
// coordinates the walk, it never touches the database directly beyond the
// read-only candidate query.
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
    private final SettlementService settlementService;

    public OrderBookMatcher(OrderMapper orderMapper, AccountMapper accountMapper, SettlementService settlementService) {
        this.orderMapper = orderMapper;
        this.accountMapper = accountMapper;
        this.settlementService = settlementService;
    }

    public record Result(int totalMatched, BigDecimal lastExecutionPrice) {
        public boolean matchedAnything() {
            return totalMatched > 0;
        }
    }

    public Result match(OrderRow incoming, AccountRow incomingAccount) {
        OrderSide incomingSide = OrderSide.valueOf(incoming.side());
        String oppositeSide = incomingSide == OrderSide.BUY ? "SELL" : "BUY";

        int remaining = incoming.remainingQuantity();
        int totalMatched = 0;
        BigDecimal lastExecutionPrice = null;

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
                String restingNewStatus = (resting.filledQuantity() + matchQuantity >= resting.quantity())
                        ? "FILLED" : "PARTIALLY_FILLED";

                AccountRow restingAccount = accountMapper.findById(resting.accountId())
                        .orElseThrow(() -> new IllegalStateException(
                                "Resting order " + resting.orderId() + " references unknown account " + resting.accountId()));

                MatchOutcome outcome = settlementService.settleMatch(
                        resting, restingAccount, OrderSide.valueOf(resting.side()),
                        incoming, incomingAccount, incomingSide,
                        matchQuantity, executionPrice, restingNewStatus);

                if (outcome.result() == MatchOutcome.Result.CONTENDED) {
                    log.info("Resting order {} was matched by a concurrent delivery first - skipping", resting.orderId());
                    continue;
                }

                remaining -= matchQuantity;
                totalMatched += matchQuantity;
                lastExecutionPrice = executionPrice;
                progressedThisPass = true;
            }

            if (!progressedThisPass) {
                // Every candidate in this pass was contended - rather than
                // spin re-querying the same rows, leave the rest resting
                // for whatever processes this order (or the next one) next.
                break;
            }
        }

        return new Result(totalMatched, lastExecutionPrice);
    }
}
