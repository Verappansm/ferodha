package com.trade.enums;

// The first 4 literals are fixed by contracts/trade-api.yaml and cannot be
// renamed: the database and the Angular UI generate their types from that
// same file, and a mismatch here breaks all three at once. Under the
// spec-exact profile (executor.matching.enabled=false, the default) no
// order ever reaches PARTIALLY_FILLED, so nothing outward-facing changes
// for that story.
//
// PARTIALLY_FILLED is the one addition, needed only because
// trade_executor's matching engine (market-sim profile) can leave a real
// order in that state - AccountService.getOrderHistory reads
// OrderStatus.valueOf(row.status()) off the live Orders table, and that
// throws IllegalArgumentException the moment a genuinely partially-filled
// row exists if this enum doesn't know the literal. NEW and
// PARTIALLY_FILLED are both working states now; FILLED/REJECTED/CANCELLED
// stay terminal.
public enum OrderStatus {
    NEW,
    FILLED,
    REJECTED,
    CANCELLED,
    PARTIALLY_FILLED
}
