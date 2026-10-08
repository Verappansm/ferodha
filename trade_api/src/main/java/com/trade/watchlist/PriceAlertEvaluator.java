package com.trade.watchlist;

import com.trade.mapper.ActiveAlertRow;
import com.trade.mapper.WatchlistItemMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

/**
 * Checks one quote against the ACTIVE alerts on its symbol (LEAP-007). An ABOVE alert fires
 * when the price reaches or passes the threshold, a BELOW alert when it reaches or falls
 * through it. Each fires once: a guarded update moves it to TRIGGERED, and only the quote
 * that won that update hands it to notifications. The alert keeps its TRIGGERED state
 * whether or not the delivery then succeeds, so the customer can always see that it fired.
 */
@Component
public class PriceAlertEvaluator {

    private static final Logger log = LoggerFactory.getLogger(PriceAlertEvaluator.class);

    private final WatchlistItemMapper items;
    private final PriceAlertNotifier notifier;

    public PriceAlertEvaluator(WatchlistItemMapper items, PriceAlertNotifier notifier) {
        this.items = items;
        this.notifier = notifier;
    }

    /** @return how many alerts this quote triggered. */
    public int evaluate(String symbol, BigDecimal price) {
        if (symbol == null || price == null || price.signum() <= 0) {
            return 0;
        }
        int fired = 0;
        for (ActiveAlertRow alert : items.findActiveAlertsForSymbol(symbol)) {
            if (!crossed(alert, price)) {
                continue;
            }
            // Each update commits on its own: no transaction is held open across deliveries.
            if (items.markTriggered(alert.itemId(), alert.armedAt(), price) != 1) {
                continue; // another quote, or a change by the customer, got there first
            }
            fired++;
            String direction = "ABOVE".equals(alert.alertDirection()) ? "above" : "below";
            String message = String.format("Price alert: %s (%s) has gone %s %s (now %s)",
                    alert.name(), alert.symbol(), direction,
                    alert.alertPrice().stripTrailingZeros().toPlainString(),
                    price.stripTrailingZeros().toPlainString());
            try {
                notifier.notifyTriggered(alert.userId(), alert.symbol(), message,
                        alert.itemId() + ":" + alert.armedAt().toInstant());
            } catch (RuntimeException e) {
                log.error("Alert {} triggered but could not be handed to notifications", alert.itemId(), e);
            }
        }
        return fired;
    }

    static boolean crossed(ActiveAlertRow alert, BigDecimal price) {
        int comparison = price.compareTo(alert.alertPrice());
        return "ABOVE".equals(alert.alertDirection()) ? comparison >= 0 : comparison <= 0;
    }
}
