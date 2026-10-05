package com.trade.executor.domain;

import com.trade.executor.mapper.AccountRow;
import com.trade.executor.mapper.InstrumentRow;

import java.math.BigDecimal;
import java.util.Optional;

// Design question 2: which Sprint 5 rules get re-checked at execution time.
// Re-checked here: instrument still tradable (rule 3, explicit AC),
// account still ACTIVE (rule 2, covers design question 3 -
// suspended-after-acceptance), affordability including the fee (rule 6,
// explicit unit test), holdings sufficiency for SELL (rule 7, defensive
// symmetry with rule 6). NOT re-checked, deliberately: account existence
// (implicit - OrderExecutionService already loaded it or the message is an
// infra fault), quantity/price validity (immutable since placement), and
// the idempotency key (redelivery is handled by SettlementService's guarded
// UPDATE, not a key lookup - see SettlementService).
//
// Each check is a pure function over an already-loaded row - no repository
// calls happen in here, keeping these as cheap and testable as FillRule.
public final class ExecutionRuleCheck {

    private static final String ACTIVE = "ACTIVE";

    private ExecutionRuleCheck() {
    }

    public static Optional<RejectionReason> checkInstrumentTradable(InstrumentRow instrument) {
        return Boolean.TRUE.equals(instrument.tradable())
                ? Optional.empty()
                : Optional.of(RejectionReason.INSTRUMENT_NOT_TRADABLE);
    }

    public static Optional<RejectionReason> checkAccountActive(AccountRow account) {
        return ACTIVE.equals(account.status())
                ? Optional.empty()
                : Optional.of(RejectionReason.ACCOUNT_NOT_ACTIVE);
    }

    public static Optional<RejectionReason> checkAffordable(AccountRow account, BigDecimal totalCashDelta) {
        return account.cashBalance().compareTo(totalCashDelta) >= 0
                ? Optional.empty()
                : Optional.of(RejectionReason.INSUFFICIENT_FUNDS);
    }

    public static Optional<RejectionReason> checkHoldingsSufficient(long heldQuantity, int orderQuantity) {
        return heldQuantity >= orderQuantity
                ? Optional.empty()
                : Optional.of(RejectionReason.INSUFFICIENT_HOLDINGS);
    }
}
