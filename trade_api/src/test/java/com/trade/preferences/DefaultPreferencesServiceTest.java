package com.trade.preferences;

import com.trade.exception.AccountNotActiveException;
import com.trade.preferences.PreferenceDtos.AlertType;
import com.trade.preferences.PreferenceDtos.ChannelRoute;
import com.trade.preferences.PreferenceDtos.ChannelRoute.Source;
import com.trade.preferences.PreferenceDtos.NotificationChannel;
import com.trade.preferences.PreferenceDtos.PreferencesResponse;
import com.trade.preferences.PreferenceDtos.PreferencesUpdateRequest;
import com.trade.preferences.PreferenceDtos.StartPage;
import com.trade.preferences.PreferenceDtos.Theme;
import com.trade.preferences.mapper.PreferenceRow;
import com.trade.preferences.mapper.PreferencesMapper;
import com.trade.service.AccountAccessGuard;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DefaultPreferencesServiceTest {

    private static final long ACCOUNT = 1L;

    private PreferencesMapper mapper;
    private DefaultPreferencesService service;

    @BeforeEach
    void setUp() {
        mapper = mock(PreferencesMapper.class);
        service = new DefaultPreferencesService(mapper, new AccountAccessGuard());
        when(mapper.findContactEmail(ACCOUNT)).thenReturn(Optional.of("royo@example.com"));
    }

    private static PreferenceRow row(String channel, Boolean filled, String theme, String startPage) {
        return new PreferenceRow(ACCOUNT, ACCOUNT, channel, filled, null, null, null,
                theme, null, null, null, startPage);
    }

    @Test
    @DisplayName("a new customer reads the defaults, and nothing is written")
    void newCustomerReadsDefaults() throws Exception {
        when(mapper.findByAccountId(ACCOUNT)).thenReturn(Optional.empty());

        PreferencesResponse prefs = service.get(ACCOUNT, ACCOUNT);

        assertEquals(PreferenceDefaults.CHANNEL, prefs.notificationChannel());
        assertEquals(PreferenceDefaults.THEME, prefs.theme());
        assertEquals(PreferenceDefaults.START_PAGE, prefs.startPage());
        assertEquals(ACCOUNT, prefs.defaultAccountId());
        assertTrue(prefs.customised().isEmpty());
        verify(mapper, never()).upsert(any());
    }

    @Test
    @DisplayName("a saved value overrides only that setting")
    void savedValueOverridesOnlyThatSetting() throws Exception {
        when(mapper.findByAccountId(ACCOUNT)).thenReturn(Optional.of(row(null, null, "DARK", null)));

        PreferencesResponse prefs = service.get(ACCOUNT, ACCOUNT);

        assertEquals(Theme.DARK, prefs.theme());
        assertEquals(PreferenceDefaults.CHANNEL, prefs.notificationChannel());
        assertEquals(PreferenceDefaults.START_PAGE, prefs.startPage());
        assertEquals(List.of("theme"), prefs.customised());
    }

    @Test
    @DisplayName("an update sends only the changed settings, and the default account is the caller's own")
    void updateWritesOnlyChangedSettings() throws Exception {
        when(mapper.findByAccountId(ACCOUNT)).thenReturn(Optional.of(row(null, null, null, "PORTFOLIO")));

        service.update(ACCOUNT, ACCOUNT, new PreferencesUpdateRequest(
                null, null, null, null, null, null, StartPage.PORTFOLIO));

        ArgumentCaptor<PreferenceRow> written = ArgumentCaptor.forClass(PreferenceRow.class);
        verify(mapper).upsert(written.capture());
        assertEquals("PORTFOLIO", written.getValue().startPage());
        assertEquals(ACCOUNT, written.getValue().defaultAccountId());
        assertNull(written.getValue().theme());
        assertNull(written.getValue().notificationChannel());
    }

    @Test
    @DisplayName("another account's preferences are refused, not returned empty")
    void anotherAccountIsRefused() {
        assertThrows(AccountNotActiveException.class, () -> service.get(2L, ACCOUNT));
        assertThrows(AccountNotActiveException.class, () -> service.update(2L, ACCOUNT,
                new PreferencesUpdateRequest(null, null, Theme.DARK, null, null, null, null)));
        assertThrows(AccountNotActiveException.class, () -> service.reset(2L, ACCOUNT));
        verify(mapper, never()).findByAccountId(anyLong());
        verify(mapper, never()).upsert(any());
        verify(mapper, never()).deleteByAccountId(anyLong());
    }

    @Test
    @DisplayName("the contact detail is referenced from the user record and returned masked")
    void contactIsMasked() throws Exception {
        when(mapper.findByAccountId(ACCOUNT)).thenReturn(Optional.empty());

        assertEquals("r****@example.com", service.get(ACCOUNT, ACCOUNT).contactDetail());
    }

    @Test
    @DisplayName("resolveChannel routes to the stored channel with the real address")
    void resolvesStoredEmail() {
        when(mapper.findByAccountId(ACCOUNT)).thenReturn(Optional.of(row("EMAIL", null, null, null)));

        ChannelRoute route = service.resolveChannel(ACCOUNT, AlertType.ORDER_FILLED);

        assertTrue(route.deliver());
        assertEquals(NotificationChannel.EMAIL, route.channel());
        assertEquals("royo@example.com", route.destination());
        assertEquals(Source.STORED, route.source());
    }

    @Test
    @DisplayName("resolveChannel honours an alert type the customer turned off")
    void resolvesSuppressedAlert() {
        when(mapper.findByAccountId(ACCOUNT)).thenReturn(Optional.of(row(null, false, null, null)));

        assertFalse(service.resolveChannel(ACCOUNT, AlertType.ORDER_FILLED).deliver());
        assertTrue(service.resolveChannel(ACCOUNT, AlertType.ORDER_REJECTED).deliver());
    }

    @Test
    @DisplayName("EMAIL with no address on file falls back to IN_APP")
    void emailWithoutContactFallsBack() {
        when(mapper.findByAccountId(ACCOUNT)).thenReturn(Optional.of(row("EMAIL", null, null, null)));
        when(mapper.findContactEmail(ACCOUNT)).thenReturn(Optional.empty());

        ChannelRoute route = service.resolveChannel(ACCOUNT, AlertType.ORDER_FILLED);

        assertEquals(NotificationChannel.IN_APP, route.channel());
        assertEquals(Source.NO_CONTACT, route.source());
    }

    @Test
    @DisplayName("resolveChannel never throws: a failing database still yields an IN_APP route")
    void resolveChannelSurvivesFailure() {
        when(mapper.findByAccountId(ACCOUNT)).thenThrow(new IllegalStateException("database down"));

        ChannelRoute route = service.resolveChannel(ACCOUNT, AlertType.ORDER_FILLED);

        assertTrue(route.deliver());
        assertEquals(NotificationChannel.IN_APP, route.channel());
        assertEquals(Source.FALLBACK, route.source());
    }

    @Test
    @DisplayName("during an outage the last known choice to mute an alert is still honoured")
    void outageUsesLastKnown() {
        when(mapper.findByAccountId(ACCOUNT))
                .thenReturn(Optional.of(row(null, false, null, null)))
                .thenThrow(new IllegalStateException("database down"));

        service.resolveChannel(ACCOUNT, AlertType.ORDER_FILLED);
        ChannelRoute route = service.resolveChannel(ACCOUNT, AlertType.ORDER_FILLED);

        assertFalse(route.deliver());
        assertEquals(Source.FALLBACK, route.source());
    }

    @Test
    @DisplayName("an email is masked to its first letter and domain")
    void masksEmail() {
        assertEquals("a****@b.com", DefaultPreferencesService.maskEmail("alice@b.com"));
        assertNull(DefaultPreferencesService.maskEmail(null));
    }
}
