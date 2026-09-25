package com.trade.executor.event;

import java.time.Instant;

public record OrderRejectedPayload(
        String orderId,
        Long accountId,
        String symbol,
        String rejectionReason,
        Instant executedOn
) {
}
