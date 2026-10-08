package com.trade.notification.service;

import com.trade.exception.AccountNotActiveException;
import com.trade.notification.domain.NotificationPreference;
import com.trade.notification.enums.NotificationChannel;
import com.trade.preferences.PreferenceDtos.PreferencesResponse;
import com.trade.preferences.PreferenceDtos.PreferencesUpdateRequest;
import com.trade.preferences.PreferencesService;
import org.springframework.stereotype.Service;

import java.time.Instant;

// The delivery channel lives in the customer's one set of preferences (Settings), read and
// written through PreferencesService. This module keeps no preference table of its own, so
// the two can never disagree about where a customer wants to be told.
@Service
public class NotificationPreferenceService {

    private final PreferencesService preferences;

    public NotificationPreferenceService(PreferencesService preferences) {
        this.preferences = preferences;
    }

    /** The account's channel: IN_APP until the customer picks another. */
    public NotificationPreference getPreference(Long accountId) throws AccountNotActiveException {
        PreferencesResponse stored = preferences.get(accountId, accountId);
        return toPreference(accountId, stored);
    }

    public NotificationPreference updatePreference(Long accountId, NotificationChannel channel)
            throws AccountNotActiveException {
        PreferencesResponse updated = preferences.update(accountId, accountId, new PreferencesUpdateRequest(
                com.trade.preferences.PreferenceDtos.NotificationChannel.valueOf(channel.name()),
                null, null, null, null, null, null));
        return toPreference(accountId, updated);
    }

    private static NotificationPreference toPreference(Long accountId, PreferencesResponse response) {
        NotificationPreference preference = new NotificationPreference(accountId,
                NotificationChannel.valueOf(response.notificationChannel().name()));
        preference.setUpdatedAt(Instant.now());
        return preference;
    }
}
