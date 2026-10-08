package com.trade.notification.controller;

import com.trade.exception.AccountNotActiveException;
import com.trade.notification.domain.NotificationPreference;
import com.trade.notification.dto.NotificationPreferencesResponseDto;
import com.trade.notification.dto.UpdateNotificationPreferencesRequestDto;
import com.trade.notification.service.NotificationPreferenceService;
import com.trade.security.AuthenticatedPrincipal;
import com.trade.security.JwtAuthFilter;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The notification channel on its own, read and written through the customer's one set of
 * preferences (B32). The account is the one JwtAuthFilter verified.
 */
@RestController
@RequestMapping("/api/v1/notification-preferences")
public class NotificationPreferenceController {

    private final NotificationPreferenceService service;

    public NotificationPreferenceController(NotificationPreferenceService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<NotificationPreferencesResponseDto> getNotificationPreferences(
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws AccountNotActiveException {
        NotificationPreference preference = service.getPreference(principal.accountId());
        return ResponseEntity.ok(new NotificationPreferencesResponseDto(
                preference.getNotificationChannel(), preference.getUpdatedAt()));
    }

    @PatchMapping
    public ResponseEntity<NotificationPreferencesResponseDto> updateNotificationPreferences(
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal,
            @Valid @RequestBody UpdateNotificationPreferencesRequestDto request)
            throws AccountNotActiveException {
        NotificationPreference preference = service.updatePreference(
                principal.accountId(), request.getNotificationChannel());
        return ResponseEntity.ok(new NotificationPreferencesResponseDto(
                preference.getNotificationChannel(), preference.getUpdatedAt()));
    }
}
