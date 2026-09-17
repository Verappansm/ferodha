package com.trade.testsupport;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;

// The team-owned test fixture the sprint-06 brief asks for: no token issuer
// is supplied this sprint, so this mints tokens that follow
// contracts/auth-api.yaml (sub, accountId, roles, iat, exp, iss, HS256) and
// hands them to the same JwtService the running application uses. It is
// never deployed - it exists only under src/test/java.
public final class JwtTestFixture {

    public static final String SECRET = "sprint-06-test-signing-secret-please-rotate";

    private JwtTestFixture() {
    }

    public static SecretKey key() {
        return Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));
    }

    public static String validToken(long accountId) {
        return validToken(accountId, List.of("CUSTOMER"));
    }

    public static String validToken(long accountId, List<String> roles) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject("11111111-1111-1111-1111-111111111111")
                .claim("accountId", accountId)
                .claim("roles", roles)
                .issuer("auth-service")
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(900)))
                .signWith(key())
                .compact();
    }

    public static String expiredToken(long accountId) {
        Instant issuedInThePast = Instant.now().minusSeconds(3600);
        return Jwts.builder()
                .subject("11111111-1111-1111-1111-111111111111")
                .claim("accountId", accountId)
                .claim("roles", List.of("CUSTOMER"))
                .issuer("auth-service")
                .issuedAt(Date.from(issuedInThePast))
                .expiration(Date.from(issuedInThePast.plusSeconds(900)))
                .signWith(key())
                .compact();
    }

    public static String signedWithWrongSecret(long accountId) {
        SecretKey wrongKey = Keys.hmacShaKeyFor("a-completely-different-secret-value".getBytes(StandardCharsets.UTF_8));
        Instant now = Instant.now();
        return Jwts.builder()
                .subject("11111111-1111-1111-1111-111111111111")
                .claim("accountId", accountId)
                .claim("roles", List.of("CUSTOMER"))
                .issuer("auth-service")
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(900)))
                .signWith(wrongKey)
                .compact();
    }

    public static String missingAccountIdClaim() {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject("11111111-1111-1111-1111-111111111111")
                .issuer("auth-service")
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(900)))
                .signWith(key())
                .compact();
    }
}
