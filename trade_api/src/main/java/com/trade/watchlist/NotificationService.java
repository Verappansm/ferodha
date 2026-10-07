package com.trade.watchlist;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service("watchlistNotificationService")
public class NotificationService {

    private final JdbcTemplate jdbcTemplate;

    public NotificationService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional
    public void createInAppNotification(UUID userId, String message, String idempotencyKey) {
        // Check if notification with this idempotency key already exists (avoid duplicates)
        Integer existing = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM legacy_notifications WHERE idempotency_key = ?",
                Integer.class,
                idempotencyKey
        );

        if (existing != null && existing > 0) {
            return; // Already notified
        }

        String payload = String.format("{\"message\":\"%s\",\"type\":\"PRICE_ALERT\",\"read\":false}",
                message.replace("\"", "\\\""));

        jdbcTemplate.update(
                "INSERT INTO legacy_notifications (user_id, payload, idempotency_key) VALUES (?, ?::jsonb, ?)",
                userId, payload, idempotencyKey
        );
    }
}
