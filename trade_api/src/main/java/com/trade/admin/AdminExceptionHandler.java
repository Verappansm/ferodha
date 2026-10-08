package com.trade.admin;

import com.fasterxml.jackson.annotation.JsonInclude;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

// Turns an AdminException into the envelope. Ordered ahead of
// GlobalExceptionHandler, whose catch-all would otherwise answer it as a 500.
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class AdminExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(AdminExceptionHandler.class);

    @ExceptionHandler(AdminException.class)
    public ResponseEntity<AdminErrorResponse> handle(AdminException exception) {
        log.warn("Admin request refused with {} ({}): {}", exception.getCode(),
                exception.getStatus().value(), exception.getDetail());
        return ResponseEntity.status(exception.getStatus())
                .body(new AdminErrorResponse(exception.getCode(), exception.getMessage(), exception.getReason()));
    }

    // The admin envelope: the shared one plus `reason`, left out when there is none.
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record AdminErrorResponse(String errorCode, String message, String reason) {
    }
}
