package com.trade.exception;

// Rule 1: no Account exists for the accountId on the order.
public class AccountNotFoundException extends DomainException {

    // Kept for the server-side log only - never put into the message, since
    // the message is sent back to the caller as-is.
    private final Long accountId;

    public AccountNotFoundException(Long accountId) {
        super("ACC-404", "Account not found");
        this.accountId = accountId;
    }

    public Long getAccountId() {
        return accountId;
    }
}
