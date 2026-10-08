package com.trade.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trade.mapper.UserAccessMapper;
import com.trade.strategy.Strategy;
import com.trade.strategy.StrategyTokenIssuer;
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
import static org.mockito.Mockito.when;

// A missing header, a wrong scheme, an expired token and a forged signature
// must all answer AUTH-401 with the identical body, before any controller
// runs - this exercises the filter directly, the one place that decision is
// made for every /api/v1/** route.
class JwtAuthFilterTest {

    private final JwtService jwtService = new JwtService(JwtTestFixture.SECRET, "auth-service");
    private final UserAccessMapper userAccess = mock(UserAccessMapper.class);
    private JwtAuthFilter filter;

    @BeforeEach
    void setUp() {
        filter = new JwtAuthFilter(jwtService, userAccess, new ObjectMapper());
    }

    @Test
    @DisplayName("A valid token for a user since suspended or forced to reset is refused with AUTH-401")
    void blockedUserIsRefused() throws Exception {
        when(userAccess.isCustomerBlocked("11111111-1111-1111-1111-111111111111")).thenReturn(true);
        MockHttpServletRequest request = protectedRequest();
        request.addHeader("Authorization", "Bearer " + JwtTestFixture.validToken(1L));
        assertRefused(request);
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

    @Test
    @DisplayName("An admin token for an operator since suspended is refused with AUTH-401")
    void blockedAdminIsRefused() throws Exception {
        when(userAccess.isAdminBlocked(JwtTestFixture.ADMIN_USER_ID)).thenReturn(true);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/admin/overview");
        request.addHeader("Authorization", "Bearer " + JwtTestFixture.adminToken());
        assertRefused(request);
    }

    private static final String STRATEGY_ID = "66666666-6666-6666-6666-666666666666";
    private static final String CUSTOMER_ID = "11111111-1111-1111-1111-111111111111";

    private String delegatedToken() {
        Strategy strategy = new Strategy(STRATEGY_ID, CUSTOMER_ID, 1L, "rule", "AAPL", "BUY", null, 1, null, null,
                1, 3, false, "ENABLED", 0, 0, null, null, null);
        return new StrategyTokenIssuer(JwtTestFixture.SECRET, "auth-service").issue(strategy);
    }

    @Test
    @DisplayName("A delegated strategy token places an order while its strategy is enabled")
    void delegatedTokenPlacesOrders() throws Exception {
        when(userAccess.isStrategyTokenValid(STRATEGY_ID, CUSTOMER_ID)).thenReturn(true);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/orders");
        request.addHeader("Authorization", "Bearer " + delegatedToken());
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, new MockHttpServletResponse(), chain);

        verify(chain, times(1)).doFilter(org.mockito.ArgumentMatchers.eq(request), org.mockito.ArgumentMatchers.any());
        AuthenticatedPrincipal principal =
                (AuthenticatedPrincipal) request.getAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE);
        assertEquals(STRATEGY_ID, principal.strategyId());
    }

    @Test
    @DisplayName("Disabling the strategy stops its token at once: the next order is AUTH-401")
    void delegatedTokenOfADisabledStrategyIsRefused() throws Exception {
        when(userAccess.isStrategyTokenValid(STRATEGY_ID, CUSTOMER_ID)).thenReturn(false);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/orders");
        request.addHeader("Authorization", "Bearer " + delegatedToken());
        assertRefused(request);
    }

    @Test
    @DisplayName("A delegated token reaches nothing but order placement: AUTH-403 elsewhere")
    void delegatedTokenIsScopedToPlacingOrders() throws Exception {
        when(userAccess.isStrategyTokenValid(STRATEGY_ID, CUSTOMER_ID)).thenReturn(true);
        for (String[] route : new String[][]{
                {"GET", "/api/v1/accounts/1"}, {"GET", "/api/v1/orders"}, {"DELETE", "/api/v1/orders/ORD-x"},
                {"POST", "/api/v1/strategies"}, {"POST", "/api/v1/orders/review"}}) {
            MockHttpServletRequest request = new MockHttpServletRequest(route[0], route[1]);
            request.addHeader("Authorization", "Bearer " + delegatedToken());
            MockHttpServletResponse response = new MockHttpServletResponse();
            FilterChain chain = mock(FilterChain.class);

            filter.doFilter(request, response, chain);

            verify(chain, never()).doFilter(request, response);
            assertEquals(403, response.getStatus(), route[0] + " " + route[1]);
        }
    }

    @Test
    @DisplayName("A suspended customer's delegated token is refused too")
    void delegatedTokenOfASuspendedCustomerIsRefused() throws Exception {
        when(userAccess.isCustomerBlocked(CUSTOMER_ID)).thenReturn(true);
        when(userAccess.isStrategyTokenValid(STRATEGY_ID, CUSTOMER_ID)).thenReturn(true);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/orders");
        request.addHeader("Authorization", "Bearer " + delegatedToken());
        assertRefused(request);
    }

    @Test
    @DisplayName("Path parameters, encoded slashes and dot segments are refused before any route is chosen")
    void smuggledPathsAreRefused() throws Exception {
        for (String uri : new String[] {"/api/v1;x/orders", "/api/v1/accounts/1;jsessionid=1",
                "/api/v1/accounts%2F1", "/api/v1/accounts/../admin/accounts", "/api/v1/%2e%2e/admin",
                "/api/v1/./orders"}) {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", uri);
            request.addHeader("Authorization", "Bearer " + JwtTestFixture.validToken(1L));
            MockHttpServletResponse response = new MockHttpServletResponse();
            FilterChain chain = mock(FilterChain.class);

            filter.doFilter(request, response, chain);

            verify(chain, never()).doFilter(request, response);
            assertEquals(400, response.getStatus(), uri);
        }
    }

    @Test
    @DisplayName("An encoded admin path is judged as the admin route it decodes to: a customer token is refused")
    void encodedAdminPathIsAnAdminRoute() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/%61dmin/accounts");
        request.addHeader("Authorization", "Bearer " + JwtTestFixture.validToken(1L));
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        verify(chain, never()).doFilter(request, response);
        assertEquals(403, response.getStatus());
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
