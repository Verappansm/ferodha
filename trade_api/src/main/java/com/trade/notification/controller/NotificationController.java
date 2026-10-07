package com.trade.notification.controller;

import com.trade.notification.dto.NotificationResponseDto;
import com.trade.notification.dto.NotificationsListResponseDto;
import com.trade.notification.dto.RecordNotificationRequestDto;
import com.trade.notification.dto.SendWatchlistAlertRequestDto;
import com.trade.notification.dto.UpdateNotificationStatusRequestDto;
import com.trade.notification.exception.PreferencesNotFoundException;
import com.trade.notification.service.NotificationService;
import com.trade.security.JwtService;
import com.trade.security.JwtVerificationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {

    private final NotificationService service;
    private final JwtService jwtService;

    public NotificationController(NotificationService service, JwtService jwtService) {
        this.service = service;
        this.jwtService = jwtService;
    }

    @GetMapping
    public ResponseEntity<NotificationsListResponseDto> listNotifications(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "0") int offset) {

        Long accountId = extractAccountIdFromToken(authHeader);

        if (limit < 1 || limit > 100) limit = 50;
        if (offset < 0) offset = 0;

        List<NotificationResponseDto> notifications = service.getNotificationsByAccount(accountId, limit, offset);
        long total = service.countByAccount(accountId);

        NotificationsListResponseDto response = new NotificationsListResponseDto(notifications, total, limit, offset);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{notificationId}")
    public ResponseEntity<?> getNotification(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable UUID notificationId) {

        Long accountId = extractAccountIdFromToken(authHeader);

        try {
            NotificationResponseDto notification = service.getNotificationById(notificationId);

            // Owner-only access control
            if (!notification.getAccountId().equals(accountId)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(new ErrorResponseDto("ACC-403", "Forbidden"));
            }

            return ResponseEntity.ok(notification);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(new ErrorResponseDto("NOT-404", "Notification not found"));
        }
    }

    @PostMapping("/watchlist/alert")
    public ResponseEntity<?> sendWatchlistAlert(
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody SendWatchlistAlertRequestDto request) {

        Long accountId = extractAccountIdFromToken(authHeader);

        try {
            NotificationResponseDto notification = service.sendWatchlistAlert(accountId, request.getSymbol(), request.getMessage());
            return ResponseEntity.status(HttpStatus.CREATED).body(notification);
        } catch (PreferencesNotFoundException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(new ErrorResponseDto("NOT-404", "Notification preferences not found"));
        }
    }

    @PostMapping("/internal/record")
    public ResponseEntity<?> recordNotification(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @Valid @RequestBody RecordNotificationRequestDto request) {

        if (!isOperator(authHeader)) {
            return operatorOnly();
        }
        try {
            NotificationResponseDto notification = service.recordNotification(
                    request.getAccountId(),
                    request.getEventId(),
                    request.getEventType(),
                    request.getOrderId(),
                    request.getSymbol()
            );
            return ResponseEntity.status(HttpStatus.CREATED).body(notification);
        } catch (IllegalArgumentException e) {
            if (e.getMessage().contains("already recorded")) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(new ErrorResponseDto("NOT-409", "Notification already recorded for this event"));
            }
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                    .body(new ErrorResponseDto("VAL-422", "Invalid input"));
        } catch (PreferencesNotFoundException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(new ErrorResponseDto("NOT-404", "Notification preferences not found"));
        }
    }

    @PatchMapping("/internal/{notificationId}/status")
    public ResponseEntity<?> updateNotificationStatus(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @PathVariable UUID notificationId,
            @Valid @RequestBody UpdateNotificationStatusRequestDto request) {

        if (!isOperator(authHeader)) {
            return operatorOnly();
        }
        try {
            NotificationResponseDto notification = service.updateNotificationStatus(
                    notificationId,
                    request.getStatus(),
                    request.getErrorMessage()
            );
            return ResponseEntity.ok(notification);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(new ErrorResponseDto("NOT-404", "Notification not found"));
        }
    }

    // The /internal routes write any account's notifications, so a customer token (which
    // JwtAuthFilter accepts on every /api/v1 route) must not reach them: operators only.
    private boolean isOperator(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return false;
        }
        try {
            jwtService.verifyAdmin(authHeader.substring(7));
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }

    private static ResponseEntity<?> operatorOnly() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(new ErrorResponseDto("AUTH-403", "Forbidden"));
    }

    private Long extractAccountIdFromToken(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            throw new IllegalArgumentException("Missing or invalid Authorization header");
        }

        String token = authHeader.substring(7);
        try {
            return jwtService.verify(token).accountId();
        } catch (JwtVerificationException e) {
            throw new IllegalArgumentException("Invalid or expired token", e);
        }
    }

    // Error response DTO
    static class ErrorResponseDto {
        public String errorCode;
        public String message;

        public ErrorResponseDto(String errorCode, String message) {
            this.errorCode = errorCode;
            this.message = message;
        }
    }
}
