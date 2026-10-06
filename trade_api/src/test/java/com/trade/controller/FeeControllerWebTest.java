package com.trade.controller;

import com.trade.security.JwtService;
import com.trade.testsupport.JwtTestFixture;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = FeeController.class)
@Import(JwtService.class)
@TestPropertySource(properties = {
        "app.jwt.secret=" + JwtTestFixture.SECRET,
        "fee.rate=0.0025"
})
class FeeControllerWebTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void returnsTheConfiguredRate() throws Exception {
        mockMvc.perform(get("/api/v1/fees").header("Authorization", bearer()))
                .andExpect(status().isOk())
                .andExpect(content().json("""
                        {"rate":0.0025}
                        """, true));
    }

    @Test
    void needsAToken() throws Exception {
        mockMvc.perform(get("/api/v1/fees")).andExpect(status().isUnauthorized());
    }

    private static String bearer() {
        return "Bearer " + JwtTestFixture.validToken(1L);
    }
}
