package com.trade.notification.mapper;

import com.trade.notification.domain.NotificationPreference;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Result;
import org.apache.ibatis.annotations.Results;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import java.util.Optional;

@Mapper
public interface NotificationPreferenceMapper {

    @Select("SELECT account_id, notification_channel, created_at, updated_at FROM notification_preferences WHERE account_id = #{accountId}")
    @Results({
        @Result(property = "accountId", column = "account_id"),
        @Result(property = "notificationChannel", column = "notification_channel"),
        @Result(property = "createdAt", column = "created_at"),
        @Result(property = "updatedAt", column = "updated_at")
    })
    Optional<NotificationPreference> findByAccountId(@Param("accountId") Long accountId);

    @Insert("INSERT INTO notification_preferences (account_id, notification_channel, created_at, updated_at) " +
            "VALUES (#{accountId}, #{notificationChannel}, #{createdAt}, #{updatedAt})")
    void insert(NotificationPreference preference);

    @Update("UPDATE notification_preferences SET notification_channel = #{notificationChannel}, updated_at = #{updatedAt} " +
            "WHERE account_id = #{accountId}")
    void update(NotificationPreference preference);
}
