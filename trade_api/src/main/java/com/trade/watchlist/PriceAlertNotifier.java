package com.trade.watchlist;

import com.trade.notification.enums.NotificationEventType;
import com.trade.notification.service.NotificationService;
import com.trade.service.AccountDirectory;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

// Turns a triggered watchlist alert into a notification through the notifications module,
// so it follows the customer's own settings (price alerts on or off, in-app or email) like
// every other notification. The account is found through AccountDirectory, never by reading
// the Accounts table from this module.
@Component
public class PriceAlertNotifier {

    private final AccountDirectory accounts;
    private final NotificationService notifications;

    public PriceAlertNotifier(AccountDirectory accounts, NotificationService notifications) {
        this.accounts = accounts;
        this.notifications = notifications;
    }

    /**
     * @param alertKey names this arming of the alert (item and when it was armed): a replayed
     *                 quote notifies once, and an alert set again can notify again.
     */
    public void notifyTriggered(UUID userId, String symbol, String message, String alertKey) {
        accounts.tradingAccountOf(userId).ifPresent(accountId -> {
            UUID eventId = UUID.nameUUIDFromBytes(("price-alert:" + alertKey).getBytes(StandardCharsets.UTF_8));
            notifications.notify(accountId, eventId, NotificationEventType.PRICE_ALERT, null, symbol, message);
        });
    }
}
