package com.trade.web;

import com.trade.dto.ErrorResponseDto;
import com.trade.exception.AccountNotActiveException;
import com.trade.exception.BankTransferException;
import com.trade.exception.DuplicateBankTransferException;
import com.trade.exception.AccountNotFoundException;
import com.trade.exception.ConcurrentUpdateException;
import com.trade.exception.DomainException;
import com.trade.exception.StrategyNotFoundException;
import com.trade.exception.StrategyStateException;
import com.trade.exception.DuplicateOrderException;
import com.trade.exception.InstrumentNotFoundException;
import com.trade.exception.InsufficientFundsException;
import com.trade.exception.InsufficientHoldingsException;
import com.trade.exception.InvalidDateRangeException;
import com.trade.exception.InvalidOrderException;
import com.trade.exception.InvalidParameterException;
import com.trade.exception.OrderNotCancellableException;
import com.trade.exception.OrderNotFoundException;
import com.trade.exception.PricingUnavailableException;
import com.trade.exception.UnsupportedCurrencyException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.Map;

// The one place a domain exception's catalogue code becomes an HTTP status.
// Every branch here returns exactly ErrorResponseDto - no stack trace, no
// field values, no internal identifier - because that body goes straight to
// the caller. Anything an investigation needs is logged here, server-side,
// from the exception's own typed fields, not from the message.
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    // Two catalogue codes are ambiguous by themselves: ORD-409 covers
    // duplicate orders, insufficient holdings, an order that cannot be
    // cancelled, and a lost optimistic-lock race, and among those an order
    // that simply does not exist is answered at 404 rather than 409. The
    // exception's own type is what settles which status applies, so the
    // mapping is keyed by type here rather than by parsing getCode().
    private static final Map<Class<? extends DomainException>, HttpStatus> STATUS_BY_TYPE = Map.ofEntries(
            Map.entry(AccountNotFoundException.class, HttpStatus.NOT_FOUND),
            Map.entry(AccountNotActiveException.class, HttpStatus.FORBIDDEN),
            Map.entry(BankTransferException.class, HttpStatus.BAD_REQUEST),
            Map.entry(DuplicateBankTransferException.class, HttpStatus.CONFLICT),
            Map.entry(InstrumentNotFoundException.class, HttpStatus.NOT_FOUND),
            Map.entry(InsufficientFundsException.class, HttpStatus.BAD_REQUEST),
            Map.entry(InsufficientHoldingsException.class, HttpStatus.CONFLICT),
            Map.entry(DuplicateOrderException.class, HttpStatus.CONFLICT),
            Map.entry(InvalidOrderException.class, HttpStatus.UNPROCESSABLE_ENTITY),
            Map.entry(InvalidDateRangeException.class, HttpStatus.UNPROCESSABLE_ENTITY),
            Map.entry(InvalidParameterException.class, HttpStatus.UNPROCESSABLE_ENTITY),
            Map.entry(OrderNotFoundException.class, HttpStatus.NOT_FOUND),
            Map.entry(OrderNotCancellableException.class, HttpStatus.CONFLICT),
            Map.entry(ConcurrentUpdateException.class, HttpStatus.CONFLICT),
            Map.entry(PricingUnavailableException.class, HttpStatus.SERVICE_UNAVAILABLE),
            Map.entry(StrategyNotFoundException.class, HttpStatus.NOT_FOUND),
            Map.entry(StrategyStateException.class, HttpStatus.CONFLICT),
            Map.entry(UnsupportedCurrencyException.class, HttpStatus.UNPROCESSABLE_ENTITY)
    );

    @ExceptionHandler(DomainException.class)
    public ResponseEntity<ErrorResponseDto> handleDomainException(DomainException exception) {
        HttpStatus status = STATUS_BY_TYPE.getOrDefault(exception.getClass(), HttpStatus.INTERNAL_SERVER_ERROR);
        log.warn("{} raised {} ({}): {}", exception.getClass().getSimpleName(), exception.getCode(),
                status.value(), diagnosticDetail(exception));
        return ResponseEntity.status(status).body(new ErrorResponseDto(exception.getCode(), exception.getMessage()));
    }

    // Bean Validation failures on @RequestBody (e.g. PlaceOrderRequestDto) -
    // the one place VAL-422 is raised for a malformed request rather than
    // one the domain itself refuses.
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponseDto> handleValidation(MethodArgumentNotValidException exception) {
        log.warn("Request failed field validation: {}", exception.getFieldErrors());
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                .body(new ErrorResponseDto("VAL-422", "Invalid input"));
    }

    // Malformed JSON, a path/query value that cannot convert to the type the
    // handler declares (e.g. a non-numeric account id), or a required query
    // parameter or header left out - a transport-
    // level input failure the DTO's Bean Validation annotations never get a
    // chance to see, but still VAL-422 to the caller.
    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class,
            MissingServletRequestParameterException.class, MissingRequestHeaderException.class})
    public ResponseEntity<ErrorResponseDto> handleMalformedRequest(Exception exception) {
        log.warn("Request body or parameter could not be read: {}", exception.getMessage());
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                .body(new ErrorResponseDto("VAL-422", "Invalid input"));
    }

    // A path no endpoint serves, or a method the path does not take: the caller's
    // mistake, not a server failure, so a 404 / 405 rather than INTERNAL-500.
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ErrorResponseDto> handleNoRoute(NoResourceFoundException exception) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(new ErrorResponseDto("RES-404", "Not found"));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ErrorResponseDto> handleWrongMethod(HttpRequestMethodNotSupportedException exception) {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED)
                .body(new ErrorResponseDto("RES-405", "Method not allowed"));
    }

    // A genuinely unanticipated failure. Still leaves as the one envelope -
    // no whitelabel page, no stack trace - with the detail on the server log
    // only.
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponseDto> handleUnexpected(Exception exception) {
        log.error("Unhandled exception reaching the API boundary", exception);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ErrorResponseDto("INTERNAL-500", "An unexpected error occurred"));
    }

    // Never logs getMessage() - on a DomainException that message is the
    // exact catalogue text sent back to the caller. What an investigation
    // needs lives on the subclass's own fields instead.
    private static String diagnosticDetail(DomainException exception) {
        return switch (exception) {
            case AccountNotFoundException e -> "accountId=" + e.getAccountId();
            case AccountNotActiveException e -> "accountId=" + e.getAccountId() + " status=" + e.getStatus();
            case InstrumentNotFoundException e -> "symbol=" + e.getSymbol();
            case InsufficientFundsException e -> "required=" + e.getRequired() + " available=" + e.getAvailable();
            case InsufficientHoldingsException e -> "requested=" + e.getRequested() + " held=" + e.getHeld();
            case DuplicateOrderException e -> "idempotencyKey=" + e.getIdempotencyKey();
            case InvalidOrderException e -> "field=" + e.getField();
            case InvalidDateRangeException e -> "from=" + e.getFrom() + " to=" + e.getTo();
            case InvalidParameterException e -> "parameter=" + e.getParameter();
            case OrderNotFoundException e -> "orderId=" + e.getOrderId();
            case OrderNotCancellableException e -> "orderId=" + e.getOrderId() + " status=" + e.getCurrentStatus();
            case ConcurrentUpdateException e -> "accountId=" + e.getAccountId();
            case PricingUnavailableException e -> "accountId=" + e.getAccountId() + " unpriced=" + e.getUnpricedSymbols();
            default -> "";
        };
    }
}
