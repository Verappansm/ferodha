package com.trade.event;

import com.trade.enums.OrderSide;
import com.trade.mapper.OrderMapper;
import com.trade.mapper.UnpublishedOrderRow;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.List;

// Resends ORDER_PLACED for portal orders that are still NEW but whose event
// Kafka never acknowledged (the broker was down, or the process died between
// the commit and the send). Without this, such an order stays NEW for ever:
// nothing else ever reads it again.
//
// Safe to repeat: the executor acts only on an order still NEW, so a second
// copy of an event that did get through is ignored there. The grace period
// keeps the sweeper away from an order whose first send is still in flight.
@Component
public class UnpublishedOrderSweeper {

    private static final Logger log = LoggerFactory.getLogger(UnpublishedOrderSweeper.class);

    private final OrderMapper orderMapper;
    private final OrderPlacedPublisher publisher;
    private final long graceSeconds;
    private final int batchSize;

    public UnpublishedOrderSweeper(OrderMapper orderMapper,
                                   OrderPlacedPublisher publisher,
                                   @Value("${orders.republish.grace-seconds:30}") long graceSeconds,
                                   @Value("${orders.republish.batch-size:100}") int batchSize) {
        this.orderMapper = orderMapper;
        this.publisher = publisher;
        this.graceSeconds = graceSeconds;
        this.batchSize = batchSize;
    }

    @Scheduled(fixedDelayString = "${orders.republish.interval-ms:30000}",
               initialDelayString = "${orders.republish.interval-ms:30000}")
    public void sweep() {
        try {
            List<UnpublishedOrderRow> stuck =
                    orderMapper.findUnpublished(OffsetDateTime.now().minusSeconds(graceSeconds), batchSize);
            if (stuck.isEmpty()) {
                return;
            }
            log.warn("Resending ORDER_PLACED for {} order(s) Kafka never acknowledged", stuck.size());
            for (UnpublishedOrderRow row : stuck) {
                publisher.publish(new OrderPlacedPayload(
                        "ORD-" + row.orderId(),
                        row.accountId(),
                        row.symbol(),
                        OrderSide.valueOf(row.side()),
                        row.quantity(),
                        row.price(),
                        row.idempotencyKey(),
                        row.placedAt().toInstant()));
            }
        } catch (RuntimeException e) {
            // A failed sweep (database or broker down) is retried next cycle;
            // letting it escape would only fill the log with a stack trace.
            log.warn("Unpublished-order sweep failed, retrying next cycle: {}", e.getMessage());
        }
    }
}
