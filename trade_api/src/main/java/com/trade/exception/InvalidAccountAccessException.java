package com.trade.exception;

/**
 * Exception raised when a caller attempts to access an account they don't own.
 * HTTP 403 Forbidden.
 */
public class InvalidAccountAccessException extends DomainException {
    private final long requestedAccountId;
    private final Long tokenAccountId;

    public InvalidAccountAccessException(long requestedAccountId, Long tokenAccountId) {
        super("ACC-403", "Access denied: you cannot access this account");
        this.requestedAccountId = requestedAccountId;
        this.tokenAccountId = tokenAccountId;
    }

    public long getRequestedAccountId() {
        return requestedAccountId;
    }

    public Long getTokenAccountId() {
        return tokenAccountId;
    }
}
