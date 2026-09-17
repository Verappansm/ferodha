package com.trade.security;

import com.trade.testsupport.JwtTestFixture;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

// Verifies tokens minted by JwtTestFixture through the same JwtService the
// running application uses - the "team-owned test fixture, verified through
// the same production code path" the sprint-06 brief asks for.
class JwtServiceTest {

    private final JwtService jwtService = new JwtService(JwtTestFixture.SECRET);

    @Test
    @DisplayName("A validly signed, unexpired token is accepted and its claims are readable")
    void validTokenIsAccepted() {
        String token = JwtTestFixture.validToken(1L);

        AuthenticatedPrincipal principal = jwtService.verify(token);

        assertEquals(1L, principal.accountId());
        assertEquals(1, principal.roles().size());
        assertEquals("CUSTOMER", principal.roles().get(0));
    }

    @Test
    @DisplayName("An expired token is refused")
    void expiredTokenIsRefused() {
        String token = JwtTestFixture.expiredToken(1L);

        assertThrows(JwtVerificationException.class, () -> jwtService.verify(token));
    }

    @Test
    @DisplayName("A token signed with a different secret (a forged signature) is refused")
    void forgedSignatureIsRefused() {
        String token = JwtTestFixture.signedWithWrongSecret(1L);

        assertThrows(JwtVerificationException.class, () -> jwtService.verify(token));
    }

    @Test
    @DisplayName("A structurally invalid token is refused rather than throwing an unchecked parser exception")
    void malformedTokenIsRefused() {
        assertThrows(JwtVerificationException.class, () -> jwtService.verify("not-a-jwt"));
    }

    @Test
    @DisplayName("A token missing the accountId claim is refused")
    void missingAccountIdClaimIsRefused() {
        String token = JwtTestFixture.missingAccountIdClaim();

        assertThrows(JwtVerificationException.class, () -> jwtService.verify(token));
    }

    @Test
    @DisplayName("Startup fails fast when JWT_SECRET has not been configured")
    void blankSecretFailsFast() {
        assertThrows(IllegalStateException.class, () -> new JwtService(" "));
    }
}
