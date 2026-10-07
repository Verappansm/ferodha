package com.trade.notification.controller;

import com.trade.notification.dto.RecordNotificationRequestDto;
import com.trade.notification.dto.UpdateNotificationStatusRequestDto;
import com.trade.notification.service.NotificationService;
import com.trade.security.JwtService;
import com.trade.security.NotAdminTokenException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// The /internal routes write any account's notifications, and JwtAuthFilter lets a
// customer token through every /api/v1 route, so the controller itself has to refuse.
class NotificationControllerInternalRoutesTest {

    private final NotificationService service = mock(NotificationService.class);
    private final JwtService jwt = mock(JwtService.class);
    private final NotificationController controller = new NotificationController(service, jwt);

    @Test
    @DisplayName("a customer token cannot record a notification for any account")
    void customerTokenCannotRecord() throws Exception {
        when(jwt.verifyAdmin("customer-token")).thenThrow(new NotAdminTokenException("not admin"));

        assertEquals(HttpStatus.FORBIDDEN,
                controller.recordNotification("Bearer customer-token", new RecordNotificationRequestDto()).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN,
                controller.recordNotification(null, new RecordNotificationRequestDto()).getStatusCode());
        verify(service, never()).recordNotification(any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("a customer token cannot change a notification's status")
    void customerTokenCannotUpdateStatus() {
        when(jwt.verifyAdmin("customer-token")).thenThrow(new NotAdminTokenException("not admin"));

        assertEquals(HttpStatus.FORBIDDEN, controller.updateNotificationStatus(
                "Bearer customer-token", UUID.randomUUID(), new UpdateNotificationStatusRequestDto()).getStatusCode());
        verify(service, never()).updateNotificationStatus(any(), any(), any());
    }
}
