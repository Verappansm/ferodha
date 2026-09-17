package com.trade.security;

// A missing header, a wrong scheme, an expired token, a forged signature or
// an unexpected signing algorithm all raise this one type. They are all
// answered with the identical AUTH-401 body, on purpose: a more specific
// message would tell an attacker which of the four they got wrong.
public class JwtVerificationException extends RuntimeException {

    public JwtVerificationException(String message) {
        super(message);
    }

    public JwtVerificationException(String message, Throwable cause) {
        super(message, cause);
    }
}
