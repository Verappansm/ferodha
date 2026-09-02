package com.trade.exception;

// Rule 3: the symbol is unknown, or it is known but delisted (not tradable).
// Both cases use the same code - from the caller's point of view there is
// nothing to buy or sell either way.
public class InstrumentNotFoundException extends DomainException {

    private final String symbol;

    public InstrumentNotFoundException(String symbol) {
        super("INS-404", "Instrument not found");
        this.symbol = symbol;
    }

    public String getSymbol() {
        return symbol;
    }
}
