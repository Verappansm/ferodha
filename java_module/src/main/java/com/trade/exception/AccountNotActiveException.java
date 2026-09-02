package com.trade.exception;

import com.trade.enums.AccountStatus;

// Rule 2: the account exists but is SUSPENDED or CLOSED, so it may not trade.
public class AccountNotActiveException extends DomainException {

    private final Long accountId;
    private final AccountStatus status;

    public AccountNotActiveException(Long accountId, AccountStatus status) {
        super("ACC-403", "Account not active");
        this.accountId = accountId;
        this.status = status;
    }

    public Long getAccountId() {
        return accountId;
    }

    public AccountStatus getStatus() {
        return status;
    }
}
