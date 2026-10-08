package com.trade.domain;

import com.trade.enums.InstrumentType;

import java.util.UUID;


public class Instrument {

    private final UUID instrumentId;
    private final String symbol;
    private final String displayName;
    private final InstrumentType assetClass;
    private final String quoteCurrency;
    private final String exchange;
    private final String sector;

    // can no longer be traded.
    private boolean tradable;

    public Instrument(UUID instrumentId, String symbol, String displayName, InstrumentType assetClass,
                       String quoteCurrency, String exchange, String sector) {
        this.instrumentId = instrumentId;
        this.symbol = symbol;
        this.displayName = displayName;
        this.assetClass = assetClass;
        this.quoteCurrency = quoteCurrency;
        this.exchange = exchange;
        this.sector = sector;
        this.tradable = true;
    }

    // OrderLogic's rule 3
    public boolean isTradable() {
        return tradable;
    }

    public void delist() {
        tradable = false;
    }

    public UUID getInstrumentId() {
        return instrumentId;
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

    public String getExchange() {
        return exchange;
    }

    public String getSector() {
        return sector;
    }
}
