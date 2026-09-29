package com.trade.web;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.filter.CorsFilter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

// The UI's origin is let through and nothing else is: an origin missing from
// CORS_ALLOWED_ORIGINS gets no Access-Control-Allow-Origin, so the browser
// refuses to hand it the response.
class CorsConfigTest {

    private static final String UI_ORIGIN = "http://localhost:4200";

    private final CorsFilter filter =
            new CorsFilter(CorsConfig.corsConfigurationSource(UI_ORIGIN + ", http://localhost:4300"));

    @Test
    @DisplayName("A preflight from an allowed origin is answered without reaching the JWT filter")
    void preflightFromAllowedOriginIsAnswered() throws Exception {
        MockHttpServletRequest request = preflight(UI_ORIGIN);
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
        assertEquals(UI_ORIGIN, response.getHeader("Access-Control-Allow-Origin"));
        verify(chain, never()).doFilter(request, response);
    }

    @Test
    @DisplayName("A preflight from an origin not on the allow list is refused")
    void preflightFromUnknownOriginIsRefused() throws Exception {
        MockHttpServletRequest request = preflight("http://evil.example");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, mock(FilterChain.class));

        assertEquals(403, response.getStatus());
        assertNull(response.getHeader("Access-Control-Allow-Origin"));
    }

    @Test
    @DisplayName("Every origin in the comma-separated list is allowed")
    void secondListedOriginIsAllowed() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(preflight("http://localhost:4300"), response, mock(FilterChain.class));

        assertEquals("http://localhost:4300", response.getHeader("Access-Control-Allow-Origin"));
    }

    @Test
    @DisplayName("A real request from an allowed origin carries the CORS header and continues down the chain")
    void actualRequestContinuesWithHeader() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/accounts/1/orders");
        request.addHeader("Origin", UI_ORIGIN);
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        assertEquals(UI_ORIGIN, response.getHeader("Access-Control-Allow-Origin"));
        verify(chain, times(1)).doFilter(request, response);
    }

    private static MockHttpServletRequest preflight(String origin) {
        MockHttpServletRequest request = new MockHttpServletRequest("OPTIONS", "/api/v1/orders");
        request.addHeader("Origin", origin);
        request.addHeader("Access-Control-Request-Method", "POST");
        request.addHeader("Access-Control-Request-Headers", "authorization, content-type");
        return request;
    }
}
