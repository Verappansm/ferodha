package com.trade.executor.settlement;

import com.trade.executor.domain.RejectionReason;
import com.trade.executor.enums.OrderSide;
import com.trade.executor.mapper.AccountMapper;
import com.trade.executor.mapper.AccountRow;
import com.trade.executor.mapper.OrderMapper;
import com.trade.executor.mapper.OrderRow;
import com.trade.executor.util.MoneyRounding;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

// The two guards, both inside one transaction:
//   Guard 1 - the status UPDATE is the first write and is conditional on
//             the order still being NEW; zero rows affected means another
//             delivery already settled it, so nothing else in this method
//             runs (Guard 1 is the actual correctness mechanism against
//             Kafka's at-least-once redelivery, not OrderExecutionService's
//             own early status check, which is only a cheap optimization).
//   Guard 2 - the optimistic lock on Accounts.version, re-read and retried
//             up to a bounded attempt count; an exhausted budget throws
//             rather than being swallowed, which rolls back Guard 1's write
//             too since both happen in the same @Transactional method.
@Service
public class SettlementService {

    private final OrderMapper orderMapper;
    private final AccountMapper accountMapper;
    private final int balanceLockMaxAttempts;

    public SettlementService(OrderMapper orderMapper, AccountMapper accountMapper,
                              @Value("${executor.balance-lock.max-attempts:3}") int balanceLockMaxAttempts) {
        this.orderMapper = orderMapper;
        this.accountMapper = accountMapper;
        this.balanceLockMaxAttempts = balanceLockMaxAttempts;
    }

    @Transactional
    public SettlementOutcome settleFill(OrderRow order, AccountRow account, BigDecimal executedPrice,
                                         Integer quantity, BigDecimal feeAmount, BigDecimal totalCashDelta,
                                         OrderSide side) {
        int rows = orderMapper.fillOrderIfNew(order.orderId(), executedPrice, feeAmount);
        if (rows == 0) {
            return SettlementOutcome.alreadyProcessed();
        }

        adjustBalanceWithRetry(account, totalCashDelta, side);
        orderMapper.insertTrade(order.orderId(), executedPrice, quantity);

        return SettlementOutcome.filled(executedPrice, feeAmount);
    }

    @Transactional
    public SettlementOutcome settleReject(OrderRow order, RejectionReason reason) {
        int rows = orderMapper.rejectOrderIfNew(order.orderId(), reason.name());
        return rows == 0 ? SettlementOutcome.alreadyProcessed() : SettlementOutcome.rejected(reason);
    }

    // Only reached when executor.matching.enabled is true (see
    // OrderBookMatcher). One resting-counterparty match: guard the resting
    // order's own row first (Guard-1-shaped, but on filled_quantity rather
    // than status, since a resting order can legally be matched more than
    // once across its lifetime); a Trades row per side, since Positions_View
    // derives from Trades joined to Orders and both sides need to see it;
    // cash on both sides, through the same guarded balance adjustment
    // settleFill already uses. restingCashDelta/incomingCashDelta arrive
    // already fee- and currency-converted for each side's own account
    // currency - OrderBookMatcher computes those with FeeCalculator and the
    // API-supplied FX rate, the same division of labour OrderExecutionService
    // already has with this class for the non-matching path (this class
    // never touches either calculator directly). The incoming order's own
    // row is never written here - see finalizeIncomingOrder, called once
    // after the whole resting-book walk completes, not per match (its
    // guard is "still NEW", which would wrongly reject the second of two
    // matches against the same incoming order if checked here instead).
    @Transactional
    public MatchOutcome settleMatch(OrderRow restingOrder, AccountRow restingAccount, OrderSide restingSide,
                                     BigDecimal restingCashDelta, BigDecimal restingFee,
                                     OrderRow incomingOrder, AccountRow incomingAccount, OrderSide incomingSide,
                                     BigDecimal incomingCashDelta,
                                     int matchedQuantity, BigDecimal executionPrice, String restingNewStatus) {
        int rows = orderMapper.matchRestingOrderIfUnchanged(restingOrder.orderId(), restingOrder.filledQuantity(),
                matchedQuantity, restingNewStatus, executionPrice, restingFee);
        if (rows == 0) {
            return MatchOutcome.contended();
        }

        orderMapper.insertTrade(restingOrder.orderId(), executionPrice, matchedQuantity);
        orderMapper.insertTrade(incomingOrder.orderId(), executionPrice, matchedQuantity);

        adjustBalanceWithRetry(restingAccount, restingCashDelta, restingSide);
        adjustBalanceWithRetry(incomingAccount, incomingCashDelta, incomingSide);

        return MatchOutcome.matched();
    }

    // The one write this class makes to the incoming order's own row,
    // after OrderBookMatcher has finished walking the resting book -
    // cumulative filled_quantity, total fee across every match this walk
    // made, and the terminal-or-still-open status in one guarded update,
    // same "still NEW" guard Guard 1 already uses (this is that order's
    // first-ever processing; a genuine redelivery is caught earlier, by
    // OrderExecutionService's own cheap status check, before matching is
    // ever attempted).
    @Transactional
    public SettlementOutcome finalizeIncomingOrder(OrderRow order, int totalMatchedQuantity,
                                                     BigDecimal lastExecutionPrice, String newStatus,
                                                     BigDecimal totalFee) {
        int rows = orderMapper.matchIncomingOrderIfNew(
                order.orderId(), totalMatchedQuantity, newStatus, lastExecutionPrice, totalFee);
        if (rows == 0) {
            return SettlementOutcome.alreadyProcessed();
        }
        return SettlementOutcome.filled(lastExecutionPrice, totalFee);
    }

    private void adjustBalanceWithRetry(AccountRow account, BigDecimal delta, OrderSide side) {
        AccountRow current = account;
        for (int attempt = 1; attempt <= balanceLockMaxAttempts; attempt++) {
            BigDecimal newBalance = MoneyRounding.toMoneyScale(side == OrderSide.BUY
                    ? current.cashBalance().subtract(delta)
                    : current.cashBalance().add(delta));
            if (newBalance.signum() < 0) {
                throw new InsufficientFundsAtSettlementException(current.id());
            }

            if (accountMapper.updateBalanceWithVersion(current.id(), newBalance, current.version()) == 1) {
                return;
            }

            if (attempt == balanceLockMaxAttempts) {
                throw new OptimisticLockExhaustedException(account.id(), attempt);
            }

            Long accountId = current.id();
            current = accountMapper.findById(accountId)
                    .orElseThrow(() -> new IllegalStateException(
                            "Account " + accountId + " disappeared mid-settlement"));
        }
    }
}
