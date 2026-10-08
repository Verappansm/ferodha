package com.trade.preferences;

import com.trade.exception.AccountNotActiveException;
import com.trade.mapper.UserAccessMapper;
import com.trade.preferences.PreferenceDtos.NotificationChannel;
import com.trade.preferences.PreferenceDtos.NotifyOn;
import com.trade.preferences.PreferenceDtos.NumberFormat;
import com.trade.preferences.PreferenceDtos.PreferencesResponse;
import com.trade.preferences.PreferenceDtos.PreferencesUpdateRequest;
import com.trade.preferences.PreferenceDtos.StartPage;
import com.trade.preferences.PreferenceDtos.Theme;
import com.trade.security.JwtService;
import com.trade.testsupport.JwtTestFixture;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = PreferencesController.class)
@Import(JwtService.class)
@TestPropertySource(properties = "app.jwt.secret=" + JwtTestFixture.SECRET)
class PreferencesControllerWebTest {

    @MockitoBean
    private UserAccessMapper userAccessMapper;

    @MockitoBean
    private PreferencesService preferencesService;

    @Autowired
    private MockMvc mockMvc;

    private static PreferencesResponse darkPortfolio() {
        return new PreferencesResponse(1L, 1L, NotificationChannel.IN_APP, "r****@example.com",
                new NotifyOn(true, true, true, true), Theme.DARK, NumberFormat.INTERNATIONAL,
                false, false, StartPage.PORTFOLIO, List.of("theme", "startPage"));
    }

    @Test
    void savedPreferencesAreReadBack() throws Exception {
        PreferencesUpdateRequest sent = new PreferencesUpdateRequest(
                null, null, Theme.DARK, null, null, null, StartPage.PORTFOLIO);
        when(preferencesService.update(eq(1L), eq(1L), eq(sent))).thenReturn(darkPortfolio());
        when(preferencesService.get(1L, 1L)).thenReturn(darkPortfolio());

        mockMvc.perform(patch("/api/v1/accounts/1/preferences")
                        .header("Authorization", "Bearer " + JwtTestFixture.validToken(1L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"theme":"DARK","startPage":"PORTFOLIO"}
                                """))
                .andExpect(status().isOk())
                .andExpect(content().json("""
                        {"theme":"DARK","startPage":"PORTFOLIO","customised":["theme","startPage"]}
                        """));

        mockMvc.perform(get("/api/v1/accounts/1/preferences")
                        .header("Authorization", "Bearer " + JwtTestFixture.validToken(1L)))
                .andExpect(status().isOk())
                .andExpect(content().json("""
                        {"accountId":1,"defaultAccountId":1,"theme":"DARK","startPage":"PORTFOLIO",
                         "contactDetail":"r****@example.com"}
                        """));
    }

    @Test
    void anotherAccountsPreferencesAreRefusedNotEmpty() throws Exception {
        when(preferencesService.get(2L, 1L)).thenThrow(new AccountNotActiveException(2L, null));

        mockMvc.perform(get("/api/v1/accounts/2/preferences")
                        .header("Authorization", "Bearer " + JwtTestFixture.validToken(1L)))
                .andExpect(status().isForbidden())
                .andExpect(content().json("""
                        {"errorCode":"ACC-403","message":"Account not active"}
                        """));
    }

    @Test
    void noTokenIsUnauthorised() throws Exception {
        mockMvc.perform(get("/api/v1/accounts/1/preferences"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void anUnknownSettingValueIsInvalidInput() throws Exception {
        mockMvc.perform(patch("/api/v1/accounts/1/preferences")
                        .header("Authorization", "Bearer " + JwtTestFixture.validToken(1L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"theme":"PURPLE"}
                                """))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(content().json("""
                        {"errorCode":"VAL-422"}
                        """));
    }

    @Test
    void noRouteExposesTheInternalResolutionPath() throws Exception {
        mockMvc.perform(get("/api/v1/accounts/1/preferences/resolve")
                        .header("Authorization", "Bearer " + JwtTestFixture.validToken(1L)))
                // No handler maps it; the platform's catch-all currently answers any unmapped path with 500.
                .andExpect(result -> assertInstanceOf(NoResourceFoundException.class, result.getResolvedException()));
    }
}
