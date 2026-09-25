package com.trade.executor.settlement;

import com.trade.executor.domain.RejectionReason;

import java.math.BigDecimal;

public record SettlementOutcome(Result result, BigDecimal executedPrice, BigDecimal feeAmount,
                                 RejectionReason rejectionReason) {

    public enum Result {
        FILLED, REJECTED, ALREADY_PROCESSED
    }

    public static SettlementOutcome filled(BigDecimal executedPrice, BigDecimal feeAmount) {
        return new SettlementOutcome(Result.FILLED, executedPrice, feeAmount, null);
    }

    public static SettlementOutcome rejected(RejectionReason reason) {
        return new SettlementOutcome(Result.REJECTED, null, null, reason);
    }

    public static SettlementOutcome alreadyProcessed() {
        return new SettlementOutcome(Result.ALREADY_PROCESSED, null, null, null);
    }
}
