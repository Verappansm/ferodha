package com.trade.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trade.dto.ErrorResponseDto;
import com.trade.mapper.UserAccessMapper;
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
import java.util.UUID;

// Answers whether the caller holds a valid token, once, for every route
// under /api/v1/**, before any controller runs. It does not decide whether
// the caller may reach a particular account - that is ACC-403, answered in
// the service layer where the account key is known.
//
// A token's signature proves who it was issued to, not that they may still
// act: a suspension or a forced password reset in the auth service cannot
// recall a token already issued. So every request also asks Users, by
// primary key, whether the token's user is still allowed in (UserAccessMapper),
// and answers the same AUTH-401 if not - effective on the next request rather
// than when the access token expires.
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    // Where the verified principal is handed to the controller layer, via
    // Spring's @RequestAttribute resolution. A plain servlet attribute is
    // used instead of a request-scoped bean so there is no ambiguity about
    // when, in the filter chain, request scope actually becomes available.
    public static final String PRINCIPAL_ATTRIBUTE = "com.trade.security.PRINCIPAL";

    // The verified operator on /api/v1/admin/** (an AdminPrincipal).
    public static final String ADMIN_PRINCIPAL_ATTRIBUTE = "com.trade.security.ADMIN_PRINCIPAL";

    private static final String PROTECTED_PREFIX = "/api/v1/";
    // Admin routes take an admin console token instead of a customer one.
    private static final String ADMIN_PREFIX = "/api/v1/admin/";
    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtService jwtService;
    private final UserAccessMapper userAccess;
    private final ObjectMapper objectMapper;

    public JwtAuthFilter(JwtService jwtService, UserAccessMapper userAccess, ObjectMapper objectMapper) {
        this.jwtService = jwtService;
        this.userAccess = userAccess;
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

        if (request.getRequestURI().startsWith(ADMIN_PREFIX)) {
            AdminPrincipal admin;
            try {
                admin = jwtService.verifyAdmin(token);
            } catch (NotAdminTokenException e) {
                writeError(response, HttpStatus.FORBIDDEN, "AUTH-403", "Forbidden");
                return;
            } catch (JwtVerificationException e) {
                writeUnauthorised(response);
                return;
            }
            if (userAccess.isAdminBlocked(admin.userId().toString())) {
                writeUnauthorised(response);
                return;
            }
            request.setAttribute(ADMIN_PRINCIPAL_ATTRIBUTE, admin);
            filterChain.doFilter(request, response);
            return;
        }

        AuthenticatedPrincipal principal;
        try {
            principal = jwtService.verify(token);
        } catch (JwtVerificationException e) {
            writeUnauthorised(response);
            return;
        }
        if (!isUuid(principal.subjectUserId()) || userAccess.isCustomerBlocked(principal.subjectUserId())) {
            writeUnauthorised(response);
            return;
        }

        request.setAttribute(PRINCIPAL_ATTRIBUTE, principal);
        filterChain.doFilter(request, response);
    }

    private static boolean isUuid(String value) {
        try {
            UUID.fromString(value);
            return true;
        } catch (IllegalArgumentException | NullPointerException e) {
            return false;
        }
    }

    private void writeUnauthorised(HttpServletResponse response) throws IOException {
        writeError(response, HttpStatus.UNAUTHORIZED, "AUTH-401", "Unauthorised");
    }

    private void writeError(HttpServletResponse response, HttpStatus status, String code, String message)
            throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getWriter(), new ErrorResponseDto(code, message));
    }
}
