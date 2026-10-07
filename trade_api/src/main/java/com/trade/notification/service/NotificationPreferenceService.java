package com.trade.notification.service;

import com.trade.notification.domain.NotificationPreference;
import com.trade.notification.domain.NotificationPreferenceRepository;
import com.trade.notification.enums.NotificationChannel;
import com.trade.notification.exception.PreferencesNotFoundException;
import org.springframework.stereotype.Service;
import java.time.Instant;

@Service
public class NotificationPreferenceService {

    private final NotificationPreferenceRepository repository;

    public NotificationPreferenceService(NotificationPreferenceRepository repository) {
        this.repository = repository;
    }

    /**
     * Get notification preference for an account.
     * Returns a default IN_APP preference if none exists.
     */
    public NotificationPreference getPreference(Long accountId) {
        return repository.findByAccountId(accountId)
                .orElse(new NotificationPreference(accountId, NotificationChannel.IN_APP));
    }

    /**
     * Get notification preference, throwing if not found.
     */
    public NotificationPreference getPreferenceOrThrow(Long accountId) throws PreferencesNotFoundException {
        return repository.findByAccountId(accountId)
                .orElseThrow(() -> new PreferencesNotFoundException("Notification preferences not found for account " + accountId));
    }

    /**
     * Create or update notification preference for an account.
     */
    public NotificationPreference updatePreference(Long accountId, NotificationChannel channel) {
        NotificationPreference preference = repository.findByAccountId(accountId)
                .orElse(new NotificationPreference(accountId, channel));

        if (repository.findByAccountId(accountId).isPresent()) {
            preference.setNotificationChannel(channel);
            preference.setUpdatedAt(Instant.now());
            repository.update(preference);
        } else {
            preference.setNotificationChannel(channel);
            preference.setCreatedAt(Instant.now());
            preference.setUpdatedAt(Instant.now());
            repository.save(preference);
        }

        return preference;
    }
}
