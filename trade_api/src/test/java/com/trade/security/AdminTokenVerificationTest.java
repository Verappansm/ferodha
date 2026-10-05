package com.trade.security;

import com.trade.testsupport.JwtTestFixture;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

// The two kinds of token never stand in for each other: an admin console
// token opens only the admin routes, a customer token only the customer ones.
class AdminTokenVerificationTest {

    private final JwtService jwtService = new JwtService(JwtTestFixture.SECRET, "auth-service");

    @Test
    @DisplayName("An admin console token is accepted on the admin routes and names the operator")
    void adminTokenIsAccepted() {
        AdminPrincipal admin = jwtService.verifyAdmin(JwtTestFixture.adminToken());

        assertEquals(UUID.fromString(JwtTestFixture.ADMIN_USER_ID), admin.userId());
    }

    @Test
    @DisplayName("A customer token on the admin routes is refused as not-admin (AUTH-403)")
    void customerTokenIsNotAdmin() {
        assertThrows(NotAdminTokenException.class,
                () -> jwtService.verifyAdmin(JwtTestFixture.validToken(1L)));
    }

    @Test
    @DisplayName("The admin audience without the ADMIN role is refused as not-admin")
    void audienceWithoutRoleIsNotAdmin() {
        assertThrows(NotAdminTokenException.class,
                () -> jwtService.verifyAdmin(JwtTestFixture.adminAudienceWithoutAdminRole()));
    }

    @Test
    @DisplayName("A forged or expired token on the admin routes is unauthenticated, not merely not-admin")
    void forgedTokenIsUnauthenticated() {
        JwtVerificationException forged = assertThrows(JwtVerificationException.class,
                () -> jwtService.verifyAdmin(JwtTestFixture.signedWithWrongSecret(1L)));
        assertEquals(JwtVerificationException.class, forged.getClass());

        JwtVerificationException expired = assertThrows(JwtVerificationException.class,
                () -> jwtService.verifyAdmin(JwtTestFixture.expiredToken(1L)));
        assertEquals(JwtVerificationException.class, expired.getClass());
    }

    @Test
    @DisplayName("An admin console token is refused on the customer routes")
    void adminTokenIsRefusedOnCustomerRoutes() {
        assertThrows(JwtVerificationException.class,
                () -> jwtService.verify(JwtTestFixture.adminToken()));
    }
}
