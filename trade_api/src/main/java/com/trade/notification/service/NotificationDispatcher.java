package com.trade.notification.service;

import com.trade.notification.domain.Notification;
import com.trade.notification.domain.NotificationRepository;
import com.trade.notification.enums.NotificationChannel;
import com.trade.notification.enums.NotificationStatus;
import com.trade.notification.mail.NotificationMailer;
import com.trade.preferences.PreferenceDtos.AlertType;
import com.trade.preferences.PreferencesService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

// Delivers a recorded notification and keeps its status honest.
//   IN_APP: the stored row is the delivery (the customer reads it in the app), so it is SENT at once.
//   EMAIL : mailed to the address on file. A failure leaves it RETRYING with the reason, tried
//           again every minute, and FAILED once it is older than MAX_AGE.
@Component
public class NotificationDispatcher {

    private static final Logger log = LoggerFactory.getLogger(NotificationDispatcher.class);
    static final Duration MAX_AGE = Duration.ofHours(1);
    private static final int BATCH = 50;

    private final NotificationRepository repository;
    private final NotificationMailer mailer;
    private final PreferencesService preferences;

    public NotificationDispatcher(NotificationRepository repository, NotificationMailer mailer,
                                  PreferencesService preferences) {
        this.repository = repository;
        this.mailer = mailer;
        this.preferences = preferences;
    }

    public void deliver(Notification notification) {
        if (notification.getResolvedChannel() == NotificationChannel.IN_APP) {
            finish(notification, NotificationStatus.SENT, null);
            return;
        }
        sendEmail(notification);
    }

    // Retries the mail that did not go out the first time.
    @Scheduled(fixedDelayString = "${notification.retry-interval-ms:60000}", initialDelay = 60_000)
    public void retryPending() {
        List<Notification> pending = repository.findByStatus(NotificationStatus.RETRYING, BATCH);
        for (Notification notification : pending) {
            try {
                if (notification.getCreatedAt().isBefore(Instant.now().minus(MAX_AGE))) {
                    finish(notification, NotificationStatus.FAILED,
                            "Gave up after " + MAX_AGE.toHours() + "h: " + notification.getErrorMessage());
                } else {
                    sendEmail(notification);
                }
            } catch (RuntimeException e) {
                log.warn("Retry of notification {} failed", notification.getNotificationId(), e);
            }
        }
    }

    private void sendEmail(Notification notification) {
        if (!mailer.isConfigured()) {
            finish(notification, NotificationStatus.FAILED, "No mail server is configured (set SMTP_HOST)");
            return;
        }
        String destination = preferences
                .resolveChannel(notification.getAccountId(), AlertType.valueOf(notification.getEventType().name()))
                .destination();
        if (destination == null || destination.isBlank()) {
            finish(notification, NotificationStatus.FAILED, "No email address on file for this account");
            return;
        }
        try {
            mailer.send(destination, subjectFor(notification), notification.getMessage());
            finish(notification, NotificationStatus.SENT, null);
        } catch (RuntimeException e) {
            // Never the address or the server's reply in the stored reason, only what failed.
            log.warn("Mail for notification {} failed: {}", notification.getNotificationId(), e.toString());
            finish(notification, NotificationStatus.RETRYING, "Mail server refused or was unreachable");
        }
    }

    private void finish(Notification notification, NotificationStatus status, String error) {
        notification.setStatus(status);
        notification.setErrorMessage(error);
        notification.setUpdatedAt(Instant.now());
        repository.update(notification);
    }

    private static String subjectFor(Notification notification) {
        return switch (notification.getEventType()) {
            case ORDER_FILLED -> "Ferodha: your order was filled";
            case ORDER_REJECTED -> "Ferodha: your order was rejected";
            case ORDER_CANCELLED -> "Ferodha: your order was cancelled";
            case PRICE_ALERT -> "Ferodha: price alert";
        };
    }
}
