package com.trade.notification.controller;

import com.trade.notification.dto.NotificationResponseDto;
import com.trade.notification.dto.NotificationsListResponseDto;
import com.trade.notification.service.NotificationService;
import com.trade.security.AuthenticatedPrincipal;
import com.trade.security.JwtAuthFilter;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * The signed-in customer's own notifications (LEAP-008). The account is the one JwtAuthFilter
 * verified, with the same checks as every other customer route (signature, a user who is still
 * allowed in, no delegated strategy token); nothing here reads a token itself. Notifications
 * are written only in-process, through NotificationService.notify: there is no HTTP route that
 * creates or changes one.
 */
@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {

    private final NotificationService service;

    public NotificationController(NotificationService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<NotificationsListResponseDto> listNotifications(
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "0") int offset) {

        Long accountId = principal.accountId();

        if (limit < 1 || limit > 100) limit = 50;
        if (offset < 0) offset = 0;

        List<NotificationResponseDto> notifications = service.getNotificationsByAccount(accountId, limit, offset);
        long total = service.countByAccount(accountId);

        NotificationsListResponseDto response = new NotificationsListResponseDto(notifications, total, limit, offset);
        response.setUnread(service.unreadCount(accountId));
        return ResponseEntity.ok(response);
    }

    @PostMapping("/read-all")
    public ResponseEntity<Void> markAllRead(
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal) {
        service.markAllRead(principal.accountId());
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{notificationId}/read")
    public ResponseEntity<?> markRead(
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal,
            @PathVariable UUID notificationId) {
        if (!service.markRead(principal.accountId(), notificationId)) {
            return notFound();
        }
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{notificationId}")
    public ResponseEntity<?> getNotification(
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal,
            @PathVariable UUID notificationId) {
        try {
            NotificationResponseDto notification = service.getNotificationById(notificationId);
            // Another customer's notification reads exactly like one that does not exist.
            if (!notification.getAccountId().equals(principal.accountId())) {
                return notFound();
            }
            return ResponseEntity.ok(notification);
        } catch (IllegalArgumentException e) {
            return notFound();
        }
    }

    private static ResponseEntity<ErrorResponseDto> notFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(new ErrorResponseDto("NOT-404", "Notification not found"));
    }

    static class ErrorResponseDto {
        public String errorCode;
        public String message;

        public ErrorResponseDto(String errorCode, String message) {
            this.errorCode = errorCode;
            this.message = message;
        }
    }
}
