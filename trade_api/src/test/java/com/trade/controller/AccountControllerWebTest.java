package com.trade.controller;

import com.trade.mapper.UserAccessMapper;
import com.trade.dto.AccountResponseDto;
import com.trade.enums.AccountStatus;
import com.trade.exception.AccountNotFoundException;
import com.trade.security.JwtService;
import com.trade.service.AccountService;
import com.trade.testsupport.JwtTestFixture;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = AccountController.class)
@Import(JwtService.class)
@TestPropertySource(properties = "app.jwt.secret=" + JwtTestFixture.SECRET)
class AccountControllerWebTest {

    // JwtAuthFilter asks Users whether the token's user may still act; the
    // slice has no database, and an unstubbed mock answers "not blocked".
    @MockitoBean
    private UserAccessMapper userAccessMapper;

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AccountService accountService;

    @Test
    void getAccountWithAValidTokenReturnsTheContractShapedResponse() throws Exception {
        when(accountService.getAccount(eq(1L), eq(1L))).thenReturn(new AccountResponseDto(
                1L, "ACC-000001", "Priya Menon", new BigDecimal("24500.75"),
                AccountStatus.ACTIVE, 7, OffsetDateTime.parse("2026-09-28T09:14:22Z")));

        mockMvc.perform(get("/api/v1/accounts/1")
                        .header("Authorization", "Bearer " + JwtTestFixture.validToken(1L)))
                .andExpect(status().isOk())
                .andExpect(content().json("""
                        {"id":1,"accountId":"ACC-000001","holderName":"Priya Menon","cashBalance":24500.75,"status":"ACTIVE","version":7}
                        """));
    }

    @Test
    void getAccountWithoutATokenIsUnauthorised() throws Exception {
        mockMvc.perform(get("/api/v1/accounts/1"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().json("""
                        {"errorCode":"AUTH-401","message":"Unauthorised"}
                        """));
    }

    @Test
    void unknownAccountReturnsAcc404() throws Exception {
        when(accountService.getAccount(eq(99L), eq(1L))).thenThrow(new AccountNotFoundException(99L));

        mockMvc.perform(get("/api/v1/accounts/99")
                        .header("Authorization", "Bearer " + JwtTestFixture.validToken(1L)))
                .andExpect(status().isNotFound())
                .andExpect(content().json("""
                        {"errorCode":"ACC-404","message":"Account not found"}
                        """));
    }
}
