package com.trade.executor.settlement;

// A buy whose cash is no longer there when it is settled: the balance was read as
// enough, then a withdrawal or another fill took it first. Unchecked, so it rolls the
// settlement transaction back (the order stays NEW); the caller then rejects the order
// with INSUFFICIENT_FUNDS instead of letting the database refuse a negative balance.
public class InsufficientFundsAtSettlementException extends RuntimeException {

    public InsufficientFundsAtSettlementException(Long accountId) {
        super("Account " + accountId + " no longer holds the cash this buy needs");
    }
}
