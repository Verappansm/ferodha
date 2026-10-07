package com.trade.notification.service;

import com.trade.notification.domain.Notification;
import com.trade.notification.domain.NotificationRepository;
import com.trade.notification.dto.NotificationResponseDto;
import com.trade.notification.enums.NotificationChannel;
import com.trade.notification.enums.NotificationEventType;
import com.trade.preferences.PreferenceDtos.AlertType;
import com.trade.preferences.PreferenceDtos.ChannelRoute;
import com.trade.preferences.PreferencesService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DuplicateKeyException;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// How a trade outcome or a price alert becomes a notification: the customer's settings decide
// whether and where, a replay is ignored, and nothing here can throw into the trade path.
class NotificationServiceTest {

    private static final UUID EVENT = UUID.fromString("bbbbbbbb-0000-4000-8000-000000000001");

    private final NotificationRepository repository = mock(NotificationRepository.class);
    private final PreferencesService preferences = mock(PreferencesService.class);
    private final NotificationDispatcher dispatcher = mock(NotificationDispatcher.class);
    private final NotificationService service = new NotificationService(repository, preferences, dispatcher);

    private void customerSetting(AlertType type, boolean deliver,
                                 com.trade.preferences.PreferenceDtos.NotificationChannel channel) {
        when(preferences.resolveChannel(7L, type)).thenReturn(new ChannelRoute(deliver, channel,
                channel == com.trade.preferences.PreferenceDtos.NotificationChannel.EMAIL ? "a@b.c" : null,
                ChannelRoute.Source.STORED));
    }

    @Test
    @DisplayName("an order outcome is stored on the customer's channel and then delivered")
    void storedThenDelivered() {
        customerSetting(AlertType.ORDER_FILLED, true, com.trade.preferences.PreferenceDtos.NotificationChannel.EMAIL);

        Optional<NotificationResponseDto> made = service.notify(7L, EVENT, NotificationEventType.ORDER_FILLED, "ORD-1", "AAPL", null);

        ArgumentCaptor<Notification> saved = ArgumentCaptor.forClass(Notification.class);
        verify(repository).save(saved.capture());
        assertEquals(NotificationChannel.EMAIL, saved.getValue().getResolvedChannel());
        assertEquals("Your order ORD-1 for AAPL has been filled.", saved.getValue().getMessage());
        verify(dispatcher).deliver(saved.getValue());
        assertTrue(made.isPresent());
    }

    @Test
    @DisplayName("a type the customer switched off is neither stored nor delivered")
    void switchedOff() {
        customerSetting(AlertType.ORDER_CANCELLED, false, com.trade.preferences.PreferenceDtos.NotificationChannel.IN_APP);

        assertTrue(service.notify(7L, EVENT, NotificationEventType.ORDER_CANCELLED, "ORD-1", "AAPL", null).isEmpty());

        verify(repository, never()).save(any());
        verify(dispatcher, never()).deliver(any());
    }

    @Test
    @DisplayName("an event already recorded is ignored, not stored or delivered twice")
    void replayIsIgnored() {
        customerSetting(AlertType.ORDER_FILLED, true, com.trade.preferences.PreferenceDtos.NotificationChannel.IN_APP);
        when(repository.findByEventId(EVENT)).thenReturn(Optional.of(new Notification()));

        assertTrue(service.notify(7L, EVENT, NotificationEventType.ORDER_FILLED, "ORD-1", "AAPL", null).isEmpty());

        verify(repository, never()).save(any());
        verify(dispatcher, never()).deliver(any());
    }

    @Test
    @DisplayName("a concurrent delivery that wins the unique index is also just ignored")
    void concurrentDuplicate() {
        customerSetting(AlertType.ORDER_FILLED, true, com.trade.preferences.PreferenceDtos.NotificationChannel.IN_APP);
        doThrow(new DuplicateKeyException("uq")).when(repository).save(any());

        assertTrue(service.notify(7L, EVENT, NotificationEventType.ORDER_FILLED, "ORD-1", "AAPL", null).isEmpty());
        verify(dispatcher, never()).deliver(any());
    }

    @Test
    @DisplayName("any failure inside is contained: it never throws into the trade or cancel that caused it")
    void neverThrows() {
        when(preferences.resolveChannel(7L, AlertType.ORDER_FILLED)).thenThrow(new IllegalStateException("db down"));

        assertTrue(service.notify(7L, EVENT, NotificationEventType.ORDER_FILLED, "ORD-1", "AAPL", null).isEmpty());
    }

    @Test
    @DisplayName("a price alert is stored with its own text, under the price-alert setting")
    void priceAlert() {
        customerSetting(AlertType.PRICE_ALERT, true, com.trade.preferences.PreferenceDtos.NotificationChannel.IN_APP);

        service.notify(7L, EVENT, NotificationEventType.PRICE_ALERT, null, "AAPL", "AAPL has gone above 200.00 (now 201.35)");

        ArgumentCaptor<Notification> saved = ArgumentCaptor.forClass(Notification.class);
        verify(repository).save(saved.capture());
        assertEquals("AAPL has gone above 200.00 (now 201.35)", saved.getValue().getMessage());
        assertEquals(NotificationEventType.PRICE_ALERT, saved.getValue().getEventType());
    }
}
