package com.trade.domain;

import com.trade.enums.InstrumentType;


public class Instrument {

    private final String symbol;
    private final String displayName;
    private final InstrumentType assetClass;
    private final String quoteCurrency;

    // can no longer be traded.
    private boolean tradable;

    public Instrument(String symbol, String displayName, InstrumentType assetClass,
                       String quoteCurrency) {
        this.symbol = symbol;
        this.displayName = displayName;
        this.assetClass = assetClass;
        this.quoteCurrency = quoteCurrency;
        this.tradable = true;
    }

    // OrderLogic's rule 3
    public boolean isTradable() {
        return tradable;
    }

    public void delist() {
        tradable = false;
    }

    public String getSymbol() {
        return symbol;
    }

    public String getDisplayName() {
        return displayName;
    }

    public InstrumentType getAssetClass() {
        return assetClass;
    }

    public String getQuoteCurrency() {
        return quoteCurrency;
    }
}
