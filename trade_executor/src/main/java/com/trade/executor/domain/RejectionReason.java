package com.trade.executor.domain;

// Stored as plain text (Orders.rejection_reason VARCHAR(40)), not a Postgres
// enum type, so this vocabulary can grow without the enum-rebuild pain
// trade_api's 002-order-status-alignment.sql documents for order_status_enum.
public enum RejectionReason {
    INSTRUMENT_NOT_TRADABLE,
    ACCOUNT_NOT_ACTIVE,
    INSUFFICIENT_FUNDS,
    INSUFFICIENT_HOLDINGS,
    NOT_MARKETABLE,
    PRICE_UNAVAILABLE
}
