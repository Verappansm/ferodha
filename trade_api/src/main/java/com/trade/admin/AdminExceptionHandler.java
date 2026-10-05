package com.trade.admin;

import com.trade.dto.ErrorResponseDto;
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
    public ResponseEntity<ErrorResponseDto> handle(AdminException exception) {
        log.warn("Admin request refused with {} ({}): {}", exception.getCode(),
                exception.getStatus().value(), exception.getDetail());
        return ResponseEntity.status(exception.getStatus())
                .body(new ErrorResponseDto(exception.getCode(), exception.getMessage()));
    }
}
