package com.trade.watchlist;

import com.trade.notification.enums.NotificationEventType;
import com.trade.notification.service.NotificationService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

// Turns a triggered watchlist alert into a notification through the notifications module,
// so it follows the customer's own settings (price alerts on or off, in-app or email) like
// every other notification.
@Component
public class PriceAlertNotifier {

    private final JdbcTemplate jdbcTemplate;
    private final NotificationService notifications;

    public PriceAlertNotifier(JdbcTemplate jdbcTemplate, NotificationService notifications) {
        this.jdbcTemplate = jdbcTemplate;
        this.notifications = notifications;
    }

    /**
     * @param alertKey names this alert as the customer set it (item, price and direction): the
     *                 same alert notifies once, and changing the alert arms it again.
     */
    public void notifyTriggered(UUID userId, String symbol, String message, String alertKey) {
        List<Long> accounts = jdbcTemplate.queryForList(
                "SELECT id FROM Accounts WHERE user_id = ? ORDER BY id LIMIT 1", Long.class, userId);
        if (accounts.isEmpty()) {
            return;   // a user with no account has nowhere to be told
        }
        UUID eventId = UUID.nameUUIDFromBytes(("price-alert:" + alertKey).getBytes(StandardCharsets.UTF_8));
        notifications.notify(accounts.get(0), eventId, NotificationEventType.PRICE_ALERT, null, symbol, message);
    }
}
