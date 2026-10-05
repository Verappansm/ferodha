package com.trade.web;

import com.trade.enums.AccountStatus;
import com.trade.enums.OrderStatus;
import com.trade.exception.AccountNotActiveException;
import com.trade.exception.AccountNotFoundException;
import com.trade.exception.ConcurrentUpdateException;
import com.trade.exception.DuplicateOrderException;
import com.trade.exception.InstrumentNotFoundException;
import com.trade.exception.InsufficientFundsException;
import com.trade.exception.InsufficientHoldingsException;
import com.trade.exception.InvalidOrderException;
import com.trade.exception.OrderNotCancellableException;
import com.trade.exception.OrderNotFoundException;
import com.trade.dto.ErrorResponseDto;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.math.BigDecimal;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;

// One @ControllerAdvice maps every domain exception to its documented code
// and status, with no stack trace or internal detail in the body - this
// checks every row of the catalogue in contracts/trade-api.yaml lands on the
// right HTTP status, including the two exceptions that share the ORD-409
// code but not the status (OrderNotFoundException at 404,
// OrderNotCancellableException at 409).
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    static Stream<Arguments> catalogueCases() {
        return Stream.of(
                Arguments.of(new AccountNotFoundException(1L), HttpStatus.NOT_FOUND, "ACC-404"),
                Arguments.of(new AccountNotActiveException(1L, AccountStatus.SUSPENDED), HttpStatus.FORBIDDEN, "ACC-403"),
                Arguments.of(new InstrumentNotFoundException("AAPL"), HttpStatus.NOT_FOUND, "INS-404"),
                Arguments.of(new InsufficientFundsException(BigDecimal.TEN, BigDecimal.ONE), HttpStatus.BAD_REQUEST, "ORD-400"),
                Arguments.of(new InsufficientHoldingsException(10, 5), HttpStatus.CONFLICT, "ORD-409"),
                Arguments.of(new DuplicateOrderException("KEY-1"), HttpStatus.CONFLICT, "ORD-409"),
                Arguments.of(new InvalidOrderException("quantity"), HttpStatus.UNPROCESSABLE_ENTITY, "VAL-422"),
                Arguments.of(new OrderNotFoundException("ORDER-1"), HttpStatus.NOT_FOUND, "ORD-409"),
                Arguments.of(new OrderNotCancellableException("ORDER-1", OrderStatus.FILLED), HttpStatus.CONFLICT, "ORD-409"),
                Arguments.of(new ConcurrentUpdateException(1L), HttpStatus.CONFLICT, "ORD-409")
        );
    }

    @ParameterizedTest
    @MethodSource("catalogueCases")
    void mapsToTheDocumentedStatusAndCode(Exception exception, HttpStatus expectedStatus, String expectedCode) {
        ResponseEntity<ErrorResponseDto> response =
                handler.handleDomainException((com.trade.exception.DomainException) exception);

        assertEquals(expectedStatus, response.getStatusCode());
        assertEquals(expectedCode, response.getBody().errorCode());
    }

    @Test
    void orderNotFoundAndOrderNotCancellableShareACodeButNotAStatus() {
        var notFound = handler.handleDomainException(new OrderNotFoundException("ORDER-1"));
        var notCancellable = handler.handleDomainException(new OrderNotCancellableException("ORDER-1", OrderStatus.FILLED));

        assertEquals("ORD-409", notFound.getBody().errorCode());
        assertEquals("ORD-409", notCancellable.getBody().errorCode());
        assertEquals(HttpStatus.NOT_FOUND, notFound.getStatusCode());
        assertEquals(HttpStatus.CONFLICT, notCancellable.getStatusCode());
    }

    @Test
    void unexpectedFailureStillLeavesAsTheEnvelopeNotAStackTrace() {
        ResponseEntity<ErrorResponseDto> response = handler.handleUnexpected(new RuntimeException("boom"));

        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
        assertEquals("INTERNAL-500", response.getBody().errorCode());
    }
}
