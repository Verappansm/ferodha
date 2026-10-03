package com.trade.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;
import java.util.UUID;

// Verifies access tokens issued under contracts/auth-api.yaml: HS256, signed
// with the shared secret in JWT_SECRET, carrying sub, accountId, roles, iat,
// exp and iss. This service only proves the token is genuine and unexpired -
// whether the account it names is the one a request addresses is a service-
// layer, not a filter, decision (see JwtAuthFilter and the account services).
//
// Admin console tokens (design/admin-auth-api.yaml) are verified by
// verifyAdmin() instead, and verify() refuses them: one token is never both.
@Service
public class JwtService {

    private static final String EXPECTED_ALGORITHM = "HS256";

    // The audience the auth service writes on an admin console token.
    // Customer tokens carry no audience.
    public static final String ADMIN_AUDIENCE = "admin-console";
    public static final String ADMIN_ROLE = "ADMIN";

    private final SecretKey signingKey;
    private final String expectedIssuer;

    public JwtService(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.issuer}") String issuer) {
        if (secret == null || secret.isBlank()) {
            // Fail fast at startup rather than accepting every token at
            // request time because nobody configured JWT_SECRET.
            throw new IllegalStateException(
                    "JWT_SECRET is not set. It must come from the environment, never a properties file.");
        }
        this.signingKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expectedIssuer = issuer;
    }

    // The customer routes' check. Signature, expiry, algorithm and issuer
    // first (parseVerified), then the claims: an admin console token is
    // refused outright, and a token without accountId is refused.
    public AuthenticatedPrincipal verify(String token) {
        Claims claims = parseVerified(token);

        if (isAdminAudience(claims)) {
            throw new JwtVerificationException("Admin console token used on a customer route");
        }

        Number accountIdClaim = claims.get("accountId", Number.class);
        if (accountIdClaim == null) {
            throw new JwtVerificationException("Token is missing the accountId claim");
        }

        @SuppressWarnings("unchecked")
        List<String> roles = claims.get("roles", List.class);

        return new AuthenticatedPrincipal(
                claims.getSubject(),
                accountIdClaim.longValue(),
                roles == null ? List.of() : roles
        );
    }

    // The admin routes' check (/api/v1/admin/**): the same signature, expiry,
    // algorithm and issuer checks, then the admin audience and the ADMIN role.
    // A genuine token that fails only those two is a customer token, and
    // raises NotAdminTokenException (answered AUTH-403).
    public AdminPrincipal verifyAdmin(String token) {
        Claims claims = parseVerified(token);

        @SuppressWarnings("unchecked")
        List<String> roles = claims.get("roles", List.class);
        if (!isAdminAudience(claims) || roles == null || !roles.contains(ADMIN_ROLE)) {
            throw new NotAdminTokenException("Token is not an admin console token");
        }

        UUID userId;
        try {
            userId = UUID.fromString(claims.getSubject());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new JwtVerificationException("Admin token subject is not a user id", e);
        }
        return new AdminPrincipal(userId, List.copyOf(roles));
    }

    // Checks the signature, then the expiry, then the algorithm, then the
    // issuer, all before any other claim on the token is trusted.
    // parseSignedClaims() verifies the signature against signingKey and
    // rejects an expired token as part of parsing; the algorithm is then
    // checked explicitly so that a token signed with a different HMAC variant
    // under the same secret is refused rather than silently accepted.
    private Claims parseVerified(String token) {
        Jws<Claims> parsed;
        try {
            parsed = Jwts.parser()
                    .verifyWith(signingKey)
                    .build()
                    .parseSignedClaims(token);
        } catch (JwtException | IllegalArgumentException e) {
            throw new JwtVerificationException("Token failed verification", e);
        }

        String algorithm = parsed.getHeader().getAlgorithm();
        if (!EXPECTED_ALGORITHM.equals(algorithm)) {
            throw new JwtVerificationException("Unexpected signing algorithm: " + algorithm);
        }

        Claims claims = parsed.getPayload();
        String tokenIssuer = claims.getIssuer();
        if (tokenIssuer == null || !expectedIssuer.equals(tokenIssuer)) {
            throw new JwtVerificationException("Token issuer mismatch: expected " + expectedIssuer + ", got " + tokenIssuer);
        }
        return claims;
    }

    private static boolean isAdminAudience(Claims claims) {
        Set<String> audience = claims.getAudience();
        return audience != null && audience.contains(ADMIN_AUDIENCE);
    }
}
