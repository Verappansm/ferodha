package com.trade.notification.service;

import com.trade.notification.domain.Notification;
import com.trade.notification.domain.NotificationRepository;
import com.trade.notification.enums.NotificationChannel;
import com.trade.notification.enums.NotificationEventType;
import com.trade.notification.enums.NotificationStatus;
import com.trade.notification.mail.NotificationMailer;
import com.trade.preferences.PreferenceDtos.AlertType;
import com.trade.preferences.PreferenceDtos.ChannelRoute;
import com.trade.preferences.PreferencesService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mail.MailSendException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// Delivery keeps the status honest: SENT only when it really was, RETRYING with a reason when the
// mail server said no, FAILED when it cannot work or has been failing too long.
class NotificationDispatcherTest {

    private final NotificationRepository repository = mock(NotificationRepository.class);
    private final NotificationMailer mailer = mock(NotificationMailer.class);
    private final PreferencesService preferences = mock(PreferencesService.class);
    private final NotificationDispatcher dispatcher = new NotificationDispatcher(repository, mailer, preferences);

    @BeforeEach
    void emailOnFile() {
        when(mailer.isConfigured()).thenReturn(true);
        when(preferences.resolveChannel(7L, AlertType.ORDER_FILLED)).thenReturn(new ChannelRoute(true,
                com.trade.preferences.PreferenceDtos.NotificationChannel.EMAIL, "priya@example.com",
                ChannelRoute.Source.STORED));
    }

    private static Notification notification(NotificationChannel channel, Instant createdAt) {
        Notification n = new Notification(7L, UUID.randomUUID(), NotificationEventType.ORDER_FILLED,
                "ORD-1", "AAPL", channel, "Your order ORD-1 for AAPL has been filled.");
        n.setCreatedAt(createdAt);
        return n;
    }

    @Test
    @DisplayName("an in-app notification is delivered by being stored: SENT, no mail")
    void inApp() {
        Notification n = notification(NotificationChannel.IN_APP, Instant.now());

        dispatcher.deliver(n);

        assertEquals(NotificationStatus.SENT, n.getStatus());
        verify(mailer, never()).send(anyString(), anyString(), anyString());
        verify(repository).update(n);
    }

    @Test
    @DisplayName("an email is mailed to the address on file and then SENT")
    void emailSent() {
        Notification n = notification(NotificationChannel.EMAIL, Instant.now());

        dispatcher.deliver(n);

        verify(mailer).send("priya@example.com", "Ferodha: your order was filled", n.getMessage());
        assertEquals(NotificationStatus.SENT, n.getStatus());
        assertNull(n.getErrorMessage());
    }

    @Test
    @DisplayName("a refusing mail server leaves it RETRYING with a reason, not SENT")
    void emailRefused() {
        Notification n = notification(NotificationChannel.EMAIL, Instant.now());
        doThrow(new MailSendException("535 bad credentials for priya@example.com")).when(mailer).send(anyString(), anyString(), anyString());

        dispatcher.deliver(n);

        assertEquals(NotificationStatus.RETRYING, n.getStatus());
        assertEquals("Mail server refused or was unreachable", n.getErrorMessage());   // no address, no server reply
    }

    @Test
    @DisplayName("with no mail server configured it is FAILED and says why")
    void noServer() {
        when(mailer.isConfigured()).thenReturn(false);
        Notification n = notification(NotificationChannel.EMAIL, Instant.now());

        dispatcher.deliver(n);

        assertEquals(NotificationStatus.FAILED, n.getStatus());
        verify(mailer, never()).send(anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("with no address on file it is FAILED and nothing is mailed")
    void noAddress() {
        when(preferences.resolveChannel(7L, AlertType.ORDER_FILLED)).thenReturn(new ChannelRoute(true,
                com.trade.preferences.PreferenceDtos.NotificationChannel.IN_APP, null, ChannelRoute.Source.NO_CONTACT));
        Notification n = notification(NotificationChannel.EMAIL, Instant.now());

        dispatcher.deliver(n);

        assertEquals(NotificationStatus.FAILED, n.getStatus());
        verify(mailer, never()).send(anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("the retry sends what failed before, and gives up on what has been failing for over an hour")
    void retry() {
        Notification fresh = notification(NotificationChannel.EMAIL, Instant.now());
        fresh.setStatus(NotificationStatus.RETRYING);
        Notification stale = notification(NotificationChannel.EMAIL, Instant.now().minus(2, ChronoUnit.HOURS));
        stale.setStatus(NotificationStatus.RETRYING);
        stale.setErrorMessage("Mail server refused or was unreachable");
        when(repository.findByStatus(any(), org.mockito.ArgumentMatchers.anyInt())).thenReturn(List.of(fresh, stale));

        dispatcher.retryPending();

        assertEquals(NotificationStatus.SENT, fresh.getStatus());
        assertEquals(NotificationStatus.FAILED, stale.getStatus());
        verify(mailer).send(anyString(), anyString(), anyString());   // only the fresh one
    }
}
