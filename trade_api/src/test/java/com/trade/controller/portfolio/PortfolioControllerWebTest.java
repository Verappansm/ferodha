package com.trade.controller.portfolio;

import com.trade.dto.portfolio.PnlResponseDto;
import com.trade.dto.portfolio.PricedPositionDto;
import com.trade.exception.AccountNotActiveException;
import com.trade.exception.InvalidDateRangeException;
import com.trade.exception.PricingUnavailableException;
import com.trade.security.JwtService;
import com.trade.service.portfolio.PortfolioService;
import com.trade.testsupport.JwtTestFixture;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = PortfolioController.class)
@Import(JwtService.class)
@TestPropertySource(properties = "app.jwt.secret=" + JwtTestFixture.SECRET)
class PortfolioControllerWebTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private PortfolioService portfolioService;

    @Test
    void positionsReturnTheContractShapeWithNullsForAnUnpricedHolding() throws Exception {
        when(portfolioService.getPricedPositions(eq(1L), eq(1L), isNull())).thenReturn(List.of(
                new PricedPositionDto(1L, "INFY.NS", 40, new BigDecimal("1580.25"), new BigDecimal("63210.00"),
                        null, null, null, null, "INR", null, true)));

        mockMvc.perform(get("/api/v1/portfolio/1/positions")
                        .header("Authorization", "Bearer " + JwtTestFixture.validToken(1L)))
                .andExpect(status().isOk())
                .andExpect(content().json("""
                        [{"accountId":1,"symbol":"INFY.NS","quantity":40,"averageCost":1580.25,"costBasis":63210.00,
                          "lastPrice":null,"marketValue":null,"unrealisedPnl":null,"unrealisedPnlPercent":null,
                          "currency":"INR","priceAsOf":null,"stale":true}]
                        """, true));
    }

    @Test
    void pnlPassesTheDateRangeAndOmitsBySymbolUnlessAsked() throws Exception {
        when(portfolioService.getPnl(eq(1L), eq(1L), eq(LocalDate.parse("2026-09-01")),
                eq(LocalDate.parse("2026-10-19")), eq(false))).thenReturn(new PnlResponseDto(
                1L, "USD", LocalDate.parse("2026-09-01"), LocalDate.parse("2026-10-19"),
                new BigDecimal("1145.50"), new BigDecimal("3820.00"), new BigDecimal("4965.50"), null,
                OffsetDateTime.parse("2026-10-19T14:05:11Z")));

        mockMvc.perform(get("/api/v1/portfolio/1/pnl?from=2026-09-01&to=2026-10-19")
                        .header("Authorization", "Bearer " + JwtTestFixture.validToken(1L)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.from").value("2026-09-01"))
                .andExpect(jsonPath("$.realisedPnl").value(1145.50))
                .andExpect(jsonPath("$.bySymbol").doesNotExist());
    }

    @Test
    void anotherCustomersAccountIsForbidden() throws Exception {
        when(portfolioService.getPortfolioSummary(eq(2L), eq(1L)))
                .thenThrow(new AccountNotActiveException(2L, null));

        mockMvc.perform(get("/api/v1/portfolio/2")
                        .header("Authorization", "Bearer " + JwtTestFixture.validToken(1L)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("ACC-403"));
    }

    @Test
    void noPriceAtAllIsServiceUnavailable() throws Exception {
        when(portfolioService.getPortfolioSummary(eq(1L), eq(1L)))
                .thenThrow(new PricingUnavailableException(1L, 3));

        mockMvc.perform(get("/api/v1/portfolio/1")
                        .header("Authorization", "Bearer " + JwtTestFixture.validToken(1L)))
                .andExpect(status().isServiceUnavailable())
                .andExpect(content().json("""
                        {"errorCode":"MKT-503","message":"Pricing unavailable"}
                        """));
    }

    @Test
    void anInvertedDateRangeIsInvalidInput() throws Exception {
        when(portfolioService.getPnl(eq(1L), eq(1L), any(), any(), anyBoolean()))
                .thenThrow(new InvalidDateRangeException(LocalDate.parse("2026-10-04"), LocalDate.parse("2026-10-01")));

        mockMvc.perform(get("/api/v1/portfolio/1/pnl?from=2026-10-04&to=2026-10-01")
                        .header("Authorization", "Bearer " + JwtTestFixture.validToken(1L)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errorCode").value("VAL-422"));
    }

    @Test
    void aMalformedDateIsInvalidInput() throws Exception {
        mockMvc.perform(get("/api/v1/portfolio/1/pnl?from=yesterday")
                        .header("Authorization", "Bearer " + JwtTestFixture.validToken(1L)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errorCode").value("VAL-422"));
    }

    @Test
    void noTokenIsUnauthorised() throws Exception {
        mockMvc.perform(get("/api/v1/portfolio/1"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("AUTH-401"));
    }
}
