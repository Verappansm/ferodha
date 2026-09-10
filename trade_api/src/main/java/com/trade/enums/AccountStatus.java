package com.trade.enums;

// Fixed by contracts/trade-api.yaml - exactly these 3 literals, nothing more.
// ACTIVE accounts can trade. SUSPENDED is reversible (support can re-activate
// it). CLOSED is permanent - a closed account is never deleted, it just never
// trades again.
public enum AccountStatus {
    ACTIVE,
    SUSPENDED,
    CLOSED
}
