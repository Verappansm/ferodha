package com.trade.notification.mapper;

import com.trade.notification.domain.Notification;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Result;
import org.apache.ibatis.annotations.Results;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Mapper
public interface NotificationMapper {

    @Select("SELECT notification_id, account_id, event_id, event_type, order_id, symbol, " +
            "resolved_channel, message, status, error_message, created_at, updated_at " +
            "FROM notifications WHERE event_id = #{eventId}")
    @Results({
        @Result(property = "notificationId", column = "notification_id"),
        @Result(property = "accountId", column = "account_id"),
        @Result(property = "eventId", column = "event_id"),
        @Result(property = "eventType", column = "event_type"),
        @Result(property = "orderId", column = "order_id"),
        @Result(property = "symbol", column = "symbol"),
        @Result(property = "resolvedChannel", column = "resolved_channel"),
        @Result(property = "message", column = "message"),
        @Result(property = "status", column = "status"),
        @Result(property = "errorMessage", column = "error_message"),
        @Result(property = "createdAt", column = "created_at"),
        @Result(property = "updatedAt", column = "updated_at")
    })
    Optional<Notification> findByEventId(@Param("eventId") UUID eventId);

    @Select("SELECT notification_id, account_id, event_id, event_type, order_id, symbol, " +
            "resolved_channel, message, status, error_message, created_at, updated_at " +
            "FROM notifications WHERE notification_id = #{notificationId}")
    @Results({
        @Result(property = "notificationId", column = "notification_id"),
        @Result(property = "accountId", column = "account_id"),
        @Result(property = "eventId", column = "event_id"),
        @Result(property = "eventType", column = "event_type"),
        @Result(property = "orderId", column = "order_id"),
        @Result(property = "symbol", column = "symbol"),
        @Result(property = "resolvedChannel", column = "resolved_channel"),
        @Result(property = "message", column = "message"),
        @Result(property = "status", column = "status"),
        @Result(property = "errorMessage", column = "error_message"),
        @Result(property = "createdAt", column = "created_at"),
        @Result(property = "updatedAt", column = "updated_at")
    })
    Optional<Notification> findById(@Param("notificationId") UUID notificationId);

    @Select("SELECT notification_id, account_id, event_id, event_type, order_id, symbol, " +
            "resolved_channel, message, status, error_message, created_at, updated_at " +
            "FROM notifications WHERE account_id = #{accountId} ORDER BY created_at DESC LIMIT #{limit} OFFSET #{offset}")
    @Results({
        @Result(property = "notificationId", column = "notification_id"),
        @Result(property = "accountId", column = "account_id"),
        @Result(property = "eventId", column = "event_id"),
        @Result(property = "eventType", column = "event_type"),
        @Result(property = "orderId", column = "order_id"),
        @Result(property = "symbol", column = "symbol"),
        @Result(property = "resolvedChannel", column = "resolved_channel"),
        @Result(property = "message", column = "message"),
        @Result(property = "status", column = "status"),
        @Result(property = "errorMessage", column = "error_message"),
        @Result(property = "createdAt", column = "created_at"),
        @Result(property = "updatedAt", column = "updated_at")
    })
    List<Notification> findByAccountIdOrderByCreatedDesc(@Param("accountId") Long accountId,
                                                          @Param("limit") int limit,
                                                          @Param("offset") int offset);

    @Select("SELECT notification_id, account_id, event_id, event_type, order_id, symbol, " +
            "resolved_channel, message, status, error_message, created_at, updated_at " +
            "FROM notifications WHERE status = #{status}::notification_status_enum " +
            "ORDER BY created_at LIMIT #{limit}")
    @Results({
        @Result(property = "notificationId", column = "notification_id"),
        @Result(property = "accountId", column = "account_id"),
        @Result(property = "eventId", column = "event_id"),
        @Result(property = "eventType", column = "event_type"),
        @Result(property = "orderId", column = "order_id"),
        @Result(property = "symbol", column = "symbol"),
        @Result(property = "resolvedChannel", column = "resolved_channel"),
        @Result(property = "message", column = "message"),
        @Result(property = "status", column = "status"),
        @Result(property = "errorMessage", column = "error_message"),
        @Result(property = "createdAt", column = "created_at"),
        @Result(property = "updatedAt", column = "updated_at")
    })
    List<Notification> findByStatus(@Param("status") String status, @Param("limit") int limit);

    @Select("SELECT COUNT(*) FROM notifications WHERE account_id = #{accountId}")
    long countByAccountId(@Param("accountId") Long accountId);

    @Insert("INSERT INTO notifications (notification_id, account_id, event_id, event_type, order_id, symbol, " +
            "resolved_channel, message, status, error_message, created_at, updated_at) " +
            "VALUES (#{notificationId}, #{accountId}, #{eventId}, #{eventType}::notification_event_type_enum, #{orderId}, #{symbol}, " +
            "#{resolvedChannel}::notification_channel_enum, #{message}, #{status}::notification_status_enum, " +
            "#{errorMessage}, #{createdAt}, #{updatedAt})")
    void insert(Notification notification);

    @Update("UPDATE notifications SET status = #{status}::notification_status_enum, error_message = #{errorMessage}, updated_at = #{updatedAt} " +
            "WHERE notification_id = #{notificationId}")
    void update(Notification notification);
}
