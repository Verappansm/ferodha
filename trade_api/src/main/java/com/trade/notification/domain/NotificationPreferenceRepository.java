package com.trade.notification.domain;

import java.util.Optional;

public interface NotificationPreferenceRepository {
    Optional<NotificationPreference> findByAccountId(Long accountId);
    void save(NotificationPreference preference);
    void update(NotificationPreference preference);
}
