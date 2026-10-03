package com.trade.admin;

import org.springframework.http.HttpStatus;

// A refusal on an admin route, carrying its catalogue code and status
// (design/admin-trade-api.yaml). Kept apart from the customer DomainException
// hierarchy: the admin codes are a separate catalogue, answered by
// AdminExceptionHandler.
public class AdminException extends RuntimeException {

    private final String code;
    private final HttpStatus status;
    // What an investigation needs; logged server-side, never sent.
    private final String detail;

    private AdminException(String code, HttpStatus status, String message, String detail) {
        super(message);
        this.code = code;
        this.status = status;
        this.detail = detail;
    }

    public static AdminException notFound(String detail) {
        return new AdminException("ADM-404", HttpStatus.NOT_FOUND, "Not found", detail);
    }

    public static AdminException conflict(String detail) {
        return new AdminException("ADM-409", HttpStatus.CONFLICT, "Conflict", detail);
    }

    public static AdminException invalid(String detail) {
        return new AdminException("VAL-422", HttpStatus.UNPROCESSABLE_ENTITY, "Invalid input", detail);
    }

    public String getCode() {
        return code;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getDetail() {
        return detail;
    }
}
