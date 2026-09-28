package com.trade.enums;

// The asset class of an Instrument (not fixed by the contract like the other
// 3 enums - this one is our own domain modelling choice).
public enum InstrumentType {
    EQUITY,
    BOND,
    ETF,
    FOREX,
    CRYPTO
}
