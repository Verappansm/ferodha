package com.trade.exception;

// Single base type for every rule failure in the domain. OrderLogic never
// throws anything else, so the caller (Sprint 6's controller) can catch this
// one type and map "code" to an HTTP status in one place.
//
// The code is the catalogue code (e.g. "ACC-404"), not an HTTP status -
// deciding the status is a transport concern, not a domain one. The message
// is the exact catalogue message and nothing else, because it is sent
// straight back to the caller as the response body: no stack trace, no field
// values, nothing an attacker could use (that is OWASP A05, "security
// misconfiguration" via information leakage). Anything a developer actually
// needs to investigate a failure goes on a typed field on the subclass
// instead, where it can be logged on the server but never shown to the caller.
public abstract class DomainException extends Exception {

    private final String code;

    public DomainException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
