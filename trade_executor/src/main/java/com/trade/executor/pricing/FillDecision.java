package com.trade.executor.pricing;

import com.trade.executor.domain.RejectionReason;

import java.math.BigDecimal;

public sealed interface FillDecision {

    record Fill(BigDecimal settlementPrice) implements FillDecision {
    }

    record Reject(RejectionReason reason) implements FillDecision {
    }
}
