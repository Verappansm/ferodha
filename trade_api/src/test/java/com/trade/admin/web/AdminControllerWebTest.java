package com.trade.admin.web;

import com.trade.admin.AdminException;
import com.trade.admin.dto.AdminDtos.AccountRequestDto;
import com.trade.admin.dto.AdminDtos.AdminSummaryDto;
import com.trade.admin.service.AdminAccountRequestService;
import com.trade.admin.service.AdminAccountService;
import com.trade.admin.service.AdminInstrumentService;
import com.trade.admin.service.AdminReadService;
import com.trade.admin.service.SystemHealthService;
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

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = AdminController.class)
@Import(JwtService.class)
@TestPropertySource(properties = "app.jwt.secret=" + JwtTestFixture.SECRET)
class AdminControllerWebTest {

    private static final UUID REQUEST_ID = UUID.fromString("0e7c3b1a-1111-4a4a-8a8a-222222222222");

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AdminReadService reads;
    @MockitoBean
    private AdminAccountRequestService requests;
    @MockitoBean
    private AdminAccountService accounts;
    @MockitoBean
    private AdminInstrumentService instruments;
    @MockitoBean
    private SystemHealthService health;

    private static String bearer(String token) {
        return "Bearer " + token;
    }

    @Test
    void anAdminRouteWithoutATokenIsUnauthorised() throws Exception {
        mockMvc.perform(get("/api/v1/admin/summary"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().json("""
                        {"errorCode":"AUTH-401","message":"Unauthorised"}
                        """));
    }

    @Test
    void aCustomerTokenOnAnAdminRouteIsForbidden() throws Exception {
        mockMvc.perform(get("/api/v1/admin/summary")
                        .header("Authorization", bearer(JwtTestFixture.validToken(1L))))
                .andExpect(status().isForbidden())
                .andExpect(content().json("""
                        {"errorCode":"AUTH-403","message":"Forbidden"}
                        """));
    }

    @Test
    void anAdminTokenReadsTheSummary() throws Exception {
        when(reads.summary()).thenReturn(new AdminSummaryDto(2, 5, 1, 3, 4, 1, 8));

        mockMvc.perform(get("/api/v1/admin/summary")
                        .header("Authorization", bearer(JwtTestFixture.adminToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pendingRequests").value(2))
                .andExpect(jsonPath("$.tradableInstruments").value(8));
    }

    @Test
    void approvingPassesTheBodyAndTheVerifiedOperatorToTheService() throws Exception {
        when(requests.approve(eq(REQUEST_ID), any(), any())).thenReturn(new AccountRequestDto(
                REQUEST_ID.toString(), "u1", "Priya Menon", "priya@example.com", "USD", "APPROVED",
                OffsetDateTime.parse("2026-10-01T09:00:00Z"), null, "Michael Brown",
                OffsetDateTime.parse("2026-10-02T09:00:00Z"), 4L));

        mockMvc.perform(post("/api/v1/admin/account-requests/" + REQUEST_ID + "/approve")
                        .header("Authorization", bearer(JwtTestFixture.adminToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"bankAccountNumber":"BANK-100004","currency":"USD"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.accountId").value(4));
        verify(requests).approve(eq(REQUEST_ID), any(), any());
    }

    @Test
    void aRejectionWithoutAReasonIsVal422AndNeverReachesTheService() throws Exception {
        mockMvc.perform(post("/api/v1/admin/account-requests/" + REQUEST_ID + "/reject")
                        .header("Authorization", bearer(JwtTestFixture.adminToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errorCode").value("VAL-422"));
        verify(requests, never()).reject(any(), any(), any());
    }

    @Test
    void anUnknownRequestIsAdm404InTheEnvelope() throws Exception {
        when(requests.reject(eq(REQUEST_ID), any(), any()))
                .thenThrow(AdminException.notFound("account request " + REQUEST_ID));

        mockMvc.perform(post("/api/v1/admin/account-requests/" + REQUEST_ID + "/reject")
                        .header("Authorization", bearer(JwtTestFixture.adminToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"Duplicate application\"}"))
                .andExpect(status().isNotFound())
                .andExpect(content().json("""
                        {"errorCode":"ADM-404","message":"Not found"}
                        """));
    }

    @Test
    void anAlreadyDecidedRequestIsAdm409() throws Exception {
        when(requests.reject(eq(REQUEST_ID), any(), any()))
                .thenThrow(AdminException.conflict("already decided"));

        mockMvc.perform(post("/api/v1/admin/account-requests/" + REQUEST_ID + "/reject")
                        .header("Authorization", bearer(JwtTestFixture.adminToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"Duplicate application\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("ADM-409"));
    }

    @Test
    void anAdminTokenOnACustomerRouteIsUnauthorised() throws Exception {
        mockMvc.perform(get("/api/v1/accounts/1")
                        .header("Authorization", bearer(JwtTestFixture.adminToken())))
                .andExpect(status().isUnauthorized());
    }
}
