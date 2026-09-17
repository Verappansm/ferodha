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

    private void adjustBalanceWithRetry(AccountRow account, BigDecimal delta, OrderSide side) {
        AccountRow current = account;
        for (int attempt = 1; attempt <= balanceLockMaxAttempts; attempt++) {
            BigDecimal newBalance = MoneyRounding.toMoneyScale(side == OrderSide.BUY
                    ? current.cashBalance().subtract(delta)
                    : current.cashBalance().add(delta));

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
