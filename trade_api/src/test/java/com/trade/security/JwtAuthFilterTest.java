package com.trade.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trade.testsupport.JwtTestFixture;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

// A missing header, a wrong scheme, an expired token and a forged signature
// must all answer AUTH-401 with the identical body, before any controller
// runs - this exercises the filter directly, the one place that decision is
// made for every /api/v1/** route.
class JwtAuthFilterTest {

    private final JwtService jwtService = new JwtService(JwtTestFixture.SECRET);
    private JwtAuthFilter filter;

    @BeforeEach
    void setUp() {
        filter = new JwtAuthFilter(jwtService, new ObjectMapper());
    }

    @Test
    @DisplayName("A valid token on a protected route is accepted and the principal is attached to the request")
    void validTokenIsAccepted() throws Exception {
        MockHttpServletRequest request = protectedRequest();
        request.addHeader("Authorization", "Bearer " + JwtTestFixture.validToken(1L));
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        verify(chain, times(1)).doFilter(request, response);
        AuthenticatedPrincipal principal =
                (AuthenticatedPrincipal) request.getAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE);
        assertEquals(1L, principal.accountId());
    }

    @Test
    @DisplayName("A missing Authorization header is refused with AUTH-401")
    void missingHeaderIsRefused() throws Exception {
        assertRefused(protectedRequest());
    }

    @Test
    @DisplayName("The wrong auth scheme is refused with AUTH-401")
    void wrongSchemeIsRefused() throws Exception {
        MockHttpServletRequest request = protectedRequest();
        request.addHeader("Authorization", "Basic dXNlcjpwYXNz");
        assertRefused(request);
    }

    @Test
    @DisplayName("An expired token is refused with AUTH-401")
    void expiredTokenIsRefused() throws Exception {
        MockHttpServletRequest request = protectedRequest();
        request.addHeader("Authorization", "Bearer " + JwtTestFixture.expiredToken(1L));
        assertRefused(request);
    }

    @Test
    @DisplayName("A forged signature is refused with AUTH-401, the same body as every other failure")
    void forgedSignatureIsRefused() throws Exception {
        MockHttpServletRequest request = protectedRequest();
        request.addHeader("Authorization", "Bearer " + JwtTestFixture.signedWithWrongSecret(1L));
        assertRefused(request);
    }

    @Test
    @DisplayName("A route outside /api/v1/ is never challenged")
    void unprotectedRouteIsNotChallenged() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/actuator/health");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        verify(chain, times(1)).doFilter(request, response);
        assertNull(request.getAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE));
    }

    private MockHttpServletRequest protectedRequest() {
        return new MockHttpServletRequest("GET", "/api/v1/accounts/1");
    }

    private void assertRefused(MockHttpServletRequest request) throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        verify(chain, never()).doFilter(request, response);
        assertEquals(401, response.getStatus());
        assertTrue(response.getContentAsString().contains("\"errorCode\":\"AUTH-401\""));
    }
}
