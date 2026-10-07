package com.trade.notification.domain;

import com.trade.notification.mapper.NotificationMapper;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class NotificationRepositoryImpl implements NotificationRepository {

    private final NotificationMapper mapper;

    public NotificationRepositoryImpl(NotificationMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public Optional<Notification> findByEventId(UUID eventId) {
        return mapper.findByEventId(eventId);
    }

    @Override
    public Optional<Notification> findById(UUID notificationId) {
        return mapper.findById(notificationId);
    }

    @Override
    public List<Notification> findByAccountIdOrderByCreatedDesc(Long accountId, int limit, int offset) {
        return mapper.findByAccountIdOrderByCreatedDesc(accountId, limit, offset);
    }

    @Override
    public long countByAccountId(Long accountId) {
        return mapper.countByAccountId(accountId);
    }

    @Override
    public long countUnreadByAccountId(Long accountId) {
        return mapper.countUnreadByAccountId(accountId);
    }

    @Override
    public int markRead(Long accountId, UUID notificationId) {
        return mapper.markRead(accountId, notificationId);
    }

    @Override
    public int markAllRead(Long accountId) {
        return mapper.markAllRead(accountId);
    }

    @Override
    public void save(Notification notification) {
        mapper.insert(notification);
    }

    @Override
    public void update(Notification notification) {
        mapper.update(notification);
    }

    @Override
    public List<Notification> findByStatus(com.trade.notification.enums.NotificationStatus status, int limit) {
        return mapper.findByStatus(status.name(), limit);
    }
}
