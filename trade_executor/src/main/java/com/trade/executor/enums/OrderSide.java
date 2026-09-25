package com.trade.executor.enums;

// Local copy of com.trade.enums.OrderSide from trade_api - this repo's own
// convention (see trade_api/manifest.env's SPRINT_5_DOMAIN_SOURCE) is to
// copy small shared pieces between the separate Maven projects rather than
// add a cross-module dependency between two independently deployable apps.
public enum OrderSide {
    BUY,
    SELL
}
