package com.trade.notification.domain;

import com.trade.notification.mapper.NotificationPreferenceMapper;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public class NotificationPreferenceRepositoryImpl implements NotificationPreferenceRepository {

    private final NotificationPreferenceMapper mapper;

    public NotificationPreferenceRepositoryImpl(NotificationPreferenceMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public Optional<NotificationPreference> findByAccountId(Long accountId) {
        return mapper.findByAccountId(accountId);
    }

    @Override
    public void save(NotificationPreference preference) {
        mapper.insert(preference);
    }

    @Override
    public void update(NotificationPreference preference) {
        mapper.update(preference);
    }
}
