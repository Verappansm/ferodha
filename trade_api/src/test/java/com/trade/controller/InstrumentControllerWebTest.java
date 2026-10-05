package com.trade.controller;

import com.trade.domain.Instrument;
import com.trade.dto.InstrumentQuoteDto;
import com.trade.enums.InstrumentType;
import com.trade.exception.InstrumentNotFoundException;
import com.trade.exception.InvalidParameterException;
import com.trade.security.JwtService;
import com.trade.service.InstrumentService;
import com.trade.service.MarketDataService;
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

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = InstrumentController.class)
@Import(JwtService.class)
@TestPropertySource(properties = "app.jwt.secret=" + JwtTestFixture.SECRET)
class InstrumentControllerWebTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private InstrumentService instrumentService;

    @MockitoBean
    private MarketDataService marketDataService;

    @Test
    void oneInstrumentBySymbol() throws Exception {
        when(marketDataService.getTradableInstrument("AAPL")).thenReturn(
                new Instrument("AAPL", "Apple Inc.", InstrumentType.EQUITY, "USD", "NASDAQ", "Technology"));

        mockMvc.perform(get("/api/v1/instruments/AAPL").header("Authorization", bearer()))
                .andExpect(status().isOk())
                .andExpect(content().json("""
                        {"symbol":"AAPL","name":"Apple Inc.","type":"EQUITY","exchange":"NASDAQ","currency":"USD","sector":"Technology"}
                        """, true));
    }

    @Test
    void unknownInstrumentIsIns404() throws Exception {
        when(marketDataService.getTradableInstrument("NOPE")).thenThrow(new InstrumentNotFoundException("NOPE"));

        mockMvc.perform(get("/api/v1/instruments/NOPE").header("Authorization", bearer()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("INS-404"));
    }

    @Test
    void quoteCarriesItsTimeAndStaleness() throws Exception {
        when(marketDataService.getQuote("AAPL")).thenReturn(new InstrumentQuoteDto("AAPL", "USD",
                new BigDecimal("100.00"), new BigDecimal("100.10"), new BigDecimal("100.05"),
                OffsetDateTime.parse("2026-10-05T11:00:00Z"), true, null, null, null, null, null));

        mockMvc.perform(get("/api/v1/instruments/AAPL/quote").header("Authorization", bearer()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stale").value(true))
                .andExpect(jsonPath("$.asOf").value("2026-10-05T11:00:00Z"))
                .andExpect(jsonPath("$.dayLow").doesNotExist());
    }

    @Test
    void unknownHistoryRangeIsVal422() throws Exception {
        when(marketDataService.getHistory("AAPL", "5Y")).thenThrow(new InvalidParameterException("range"));

        mockMvc.perform(get("/api/v1/instruments/AAPL/history?range=5Y").header("Authorization", bearer()))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errorCode").value("VAL-422"));
    }

    @Test
    void anOutOfBoundsPageSizeIsVal422NotA500() throws Exception {
        when(instrumentService.getInstruments(anyInt(), anyLong())).thenThrow(new InvalidParameterException("pageSize"));

        mockMvc.perform(get("/api/v1/instruments?pageSize=-1").header("Authorization", bearer()))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void everyRouteNeedsAToken() throws Exception {
        mockMvc.perform(get("/api/v1/instruments/AAPL/quote")).andExpect(status().isUnauthorized());
    }

    private static String bearer() {
        return "Bearer " + JwtTestFixture.validToken(1L);
    }
}
