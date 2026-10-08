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
    // A sentence for the operator, sent as `reason`; null unless refused().
    private final String reason;

    private AdminException(String code, HttpStatus status, String message, String detail, String reason) {
        super(message);
        this.code = code;
        this.status = status;
        this.detail = detail;
        this.reason = reason;
    }

    public static AdminException notFound(String detail) {
        return new AdminException("ADM-404", HttpStatus.NOT_FOUND, "Not found", detail, null);
    }

    public static AdminException conflict(String detail) {
        return new AdminException("ADM-409", HttpStatus.CONFLICT, "Conflict", detail, null);
    }

    // A business rule refused the change. Unlike conflict(), the reason is sent (as
    // `reason`): it is written for the operator, names nothing they cannot already see,
    // and is the only way they can tell what to fix (an approval the bank side has to
    // act on first).
    public static AdminException refused(String reason) {
        return new AdminException("ADM-409", HttpStatus.CONFLICT, "Conflict", reason, reason);
    }

    public static AdminException invalid(String detail) {
        return new AdminException("VAL-422", HttpStatus.UNPROCESSABLE_ENTITY, "Invalid input", detail, null);
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

    public String getReason() {
        return reason;
    }
}
