package com.trade.mapper;

import com.trade.preferences.PreferenceDtos.PreferencesResponse;
import com.trade.preferences.PreferenceDtos.PreferencesUpdateRequest;
import com.trade.preferences.PreferenceDtos.StartPage;
import com.trade.preferences.PreferenceDtos.Theme;
import com.trade.preferences.PreferencesService;
import com.trade.preferences.mapper.PreferencesMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.annotation.DirtiesContext;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

// The real mapper XML against real Postgres. The restart case closes the
// whole Spring context after the write (@DirtiesContext) and reads back in a
// brand-new one: nothing held in memory survives that, only the database.
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class PreferencesMapperIT extends MapperIntegrationTestSupport {

    private static long restartAccount;

    @Autowired
    private PreferencesService preferencesService;

    @Autowired
    private PreferencesMapper preferencesMapper;

    @Test
    @Order(1)
    @DisplayName("preferences are saved and read back, with unchanged settings left on default")
    void savedAndReadBack() throws Exception {
        long account = insertAccount("prefs-read@example.com", "BANK-PREF-1", BigDecimal.ZERO);
        assertTrue(preferencesMapper.findByAccountId(account).isEmpty(), "nothing stored before a change");

        preferencesService.update(account, account,
                new PreferencesUpdateRequest(null, null, Theme.DARK, null, null, null, null));
        preferencesService.update(account, account,
                new PreferencesUpdateRequest(null, null, null, null, true, null, null));

        PreferencesResponse read = preferencesService.get(account, account);
        assertEquals(Theme.DARK, read.theme(), "first change kept by the second");
        assertTrue(read.compactTables());
        assertEquals(StartPage.DASHBOARD, read.startPage());
        assertEquals(List.of("theme", "compactTables"), read.customised());
        assertEquals("p****@example.com", read.contactDetail());
    }

    @Test
    @Order(2)
    @DirtiesContext(methodMode = DirtiesContext.MethodMode.AFTER_METHOD)
    @DisplayName("restart, part 1: write, then the application context is thrown away")
    void writeBeforeRestart() throws Exception {
        restartAccount = insertAccount("prefs-restart@example.com", "BANK-PREF-2", BigDecimal.ZERO);
        preferencesService.update(restartAccount, restartAccount,
                new PreferencesUpdateRequest(null, null, null, null, null, true, StartPage.ORDERS));
    }

    @Test
    @Order(3)
    @DisplayName("restart, part 2: preferences survive a restart of the service")
    void readAfterRestart() throws Exception {
        PreferencesResponse read = preferencesService.get(restartAccount, restartAccount);
        assertEquals(StartPage.ORDERS, read.startPage());
        assertTrue(read.hideBalances());
    }

    @Test
    @Order(4)
    @DisplayName("reset removes the row, so the defaults apply again")
    void resetRemovesRow() throws Exception {
        long account = insertAccount("prefs-reset@example.com", "BANK-PREF-3", BigDecimal.ZERO);
        preferencesService.update(account, account,
                new PreferencesUpdateRequest(null, null, Theme.DARK, null, null, null, null));

        PreferencesResponse reset = preferencesService.reset(account, account);

        assertTrue(reset.customised().isEmpty());
        assertTrue(preferencesMapper.findByAccountId(account).isEmpty());
    }
}
