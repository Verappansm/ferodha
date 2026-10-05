package com.trade.security;

// A genuine, unexpired token from the auth service that is not an admin token:
// a customer token sent to /api/v1/admin/**. Answered AUTH-403 rather than
// AUTH-401, because the caller is authenticated, just not allowed there.
public class NotAdminTokenException extends JwtVerificationException {

    public NotAdminTokenException(String message) {
        super(message);
    }
}
