package com.trade.strategy;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;

// The identity a strategy trades under. Nobody is signed in when it fires, so
// it cannot borrow a customer's access token (15 minutes, and gone at logout
// or suspension) and no password or refresh token is ever stored for it.
// Instead each order is placed with a delegated token minted for that one
// order:
//
//   sub        the customer, so the order route sees the real account owner
//   accountId  the one account the strategy trades
//   strategyId which strategy is acting; JwtAuthFilter checks it is still
//              ENABLED on every request, so disabling stops the very next order
//   act.sub    "strategy-service": who is acting on the customer's behalf
//              (the actor claim of RFC 8693 token exchange)
//   exp        60 seconds
//
// JwtAuthFilter lets a delegated token reach POST /api/v1/orders and nothing
// else, so it cannot read a portfolio, cancel an order or edit a strategy.
//
// Limit of this design, recorded in the decision log: tokens here are HS256
// under one shared secret, so this service could mint any token. The scope,
// lifetime and per-request checks above are what hold it to one strategy; a
// production system would give the minting service its own asymmetric key.
@Component
public class StrategyTokenIssuer {

    public static final String ACTOR = "strategy-service";
    static final long TTL_SECONDS = 60;

    private final SecretKey signingKey;
    private final String issuer;

    public StrategyTokenIssuer(@Value("${app.jwt.secret}") String secret,
                               @Value("${app.jwt.issuer}") String issuer) {
        this.signingKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.issuer = issuer;
    }

    public String issue(Strategy strategy) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(strategy.userId())
                .issuer(issuer)
                .claim("accountId", strategy.accountId())
                .claim("roles", List.of("CUSTOMER"))
                .claim("strategyId", strategy.strategyId())
                .claim("act", Map.of("sub", ACTOR))
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(TTL_SECONDS)))
                .signWith(signingKey)
                .compact();
    }
}
