package com.trade.enums;

// These 4 literals are fixed by contracts/trade-api.yaml, so they cannot be
// renamed or added to: the database and the Angular UI generate their types
// from that same file, and a mismatch here breaks all three at once.
//
// NEW is the only working state; the other three are terminal. There is no
// PARTIALLY_FILLED state on purpose - the Trade Executor (built in a later
// sprint) either fills an order in full or rejects it.
public enum OrderStatus {
    NEW,
    FILLED,
    REJECTED,
    CANCELLED
}
