package com.trade.notification.controller;

import com.trade.notification.domain.NotificationPreference;
import com.trade.notification.dto.NotificationPreferencesResponseDto;
import com.trade.notification.dto.UpdateNotificationPreferencesRequestDto;
import com.trade.notification.service.NotificationPreferenceService;
import com.trade.security.JwtService;
import com.trade.security.JwtVerificationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/notification-preferences")
public class NotificationPreferenceController {

    private final NotificationPreferenceService service;
    private final JwtService jwtService;

    public NotificationPreferenceController(NotificationPreferenceService service, JwtService jwtService) {
        this.service = service;
        this.jwtService = jwtService;
    }

    @GetMapping
    public ResponseEntity<NotificationPreferencesResponseDto> getNotificationPreferences(
            @RequestHeader("Authorization") String authHeader) {

        Long accountId = extractAccountIdFromToken(authHeader);
        NotificationPreference preference = service.getPreference(accountId);

        NotificationPreferencesResponseDto response = new NotificationPreferencesResponseDto(
                preference.getNotificationChannel(),
                preference.getUpdatedAt()
        );

        return ResponseEntity.ok(response);
    }

    @PatchMapping
    public ResponseEntity<NotificationPreferencesResponseDto> updateNotificationPreferences(
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody UpdateNotificationPreferencesRequestDto request) {

        Long accountId = extractAccountIdFromToken(authHeader);
        NotificationPreference preference = service.updatePreference(accountId, request.getNotificationChannel());

        NotificationPreferencesResponseDto response = new NotificationPreferencesResponseDto(
                preference.getNotificationChannel(),
                preference.getUpdatedAt()
        );

        return ResponseEntity.ok(response);
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
}
