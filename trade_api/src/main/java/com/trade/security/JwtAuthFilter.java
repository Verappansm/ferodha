package com.trade.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trade.dto.ErrorResponseDto;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

// Answers whether the caller holds a valid token, once, for every route
// under /api/v1/**, before any controller runs. It does not decide whether
// the caller may reach a particular account - that is ACC-403, answered in
// the service layer where the account key is known.
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    // Where the verified principal is handed to the controller layer, via
    // Spring's @RequestAttribute resolution. A plain servlet attribute is
    // used instead of a request-scoped bean so there is no ambiguity about
    // when, in the filter chain, request scope actually becomes available.
    public static final String PRINCIPAL_ATTRIBUTE = "com.trade.security.PRINCIPAL";

    private static final String PROTECTED_PREFIX = "/api/v1/";
    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtService jwtService;
    private final ObjectMapper objectMapper;

    public JwtAuthFilter(JwtService jwtService, ObjectMapper objectMapper) {
        this.jwtService = jwtService;
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                     FilterChain filterChain) throws ServletException, IOException {
        if (!request.getRequestURI().startsWith(PROTECTED_PREFIX)) {
            filterChain.doFilter(request, response);
            return;
        }

        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header == null || !header.startsWith(BEARER_PREFIX)) {
            writeUnauthorised(response);
            return;
        }

        String token = header.substring(BEARER_PREFIX.length()).trim();
        AuthenticatedPrincipal principal;
        try {
            principal = jwtService.verify(token);
        } catch (JwtVerificationException e) {
            writeUnauthorised(response);
            return;
        }

        request.setAttribute(PRINCIPAL_ATTRIBUTE, principal);
        filterChain.doFilter(request, response);
    }

    private void writeUnauthorised(HttpServletResponse response) throws IOException {
        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getWriter(), new ErrorResponseDto("AUTH-401", "Unauthorised"));
    }
}
