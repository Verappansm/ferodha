package com.trade.exception;

// Sprint 6 addition: the optimistic-lock write on the account row affected
// zero rows, i.e. another request updated the same account between our read
// and our write. The contract answers this with ORD-409 rather than treating
// zero-rows-affected as success.
public class ConcurrentUpdateException extends DomainException {

    private final Long accountId;

    public ConcurrentUpdateException(Long accountId) {
        super("ORD-409", "Order could not be completed, please retry");
        this.accountId = accountId;
    }

    public Long getAccountId() {
        return accountId;
    }
}
