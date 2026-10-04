package com.trade.exception;

// contracts/portfolio-api.yaml: no price could be found for any held
// instrument. A partial outage is not this - it answers 200 with the
// unpriced positions flagged stale and the summary marked partial.
public class PricingUnavailableException extends DomainException {

    private final long accountId;
    private final int unpricedSymbols;

    public PricingUnavailableException(long accountId, int unpricedSymbols) {
        super("MKT-503", "Pricing unavailable");
        this.accountId = accountId;
        this.unpricedSymbols = unpricedSymbols;
    }

    public long getAccountId() {
        return accountId;
    }

    public int getUnpricedSymbols() {
        return unpricedSymbols;
    }
}
