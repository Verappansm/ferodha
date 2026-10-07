package com.trade.notification.domain;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface NotificationRepository {
    Optional<Notification> findByEventId(UUID eventId);
    Optional<Notification> findById(UUID notificationId);
    List<Notification> findByAccountIdOrderByCreatedDesc(Long accountId, int limit, int offset);
    long countByAccountId(Long accountId);
    void save(Notification notification);
    void update(Notification notification);

    // The oldest first, for the delivery retry.
    List<Notification> findByStatus(com.trade.notification.enums.NotificationStatus status, int limit);
}
