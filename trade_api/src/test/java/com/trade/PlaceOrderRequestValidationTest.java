package com.trade;

import com.trade.dto.PlaceOrderRequestDto;
import com.trade.enums.OrderSide;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

// PlaceOrderRequestDto is an immutable record (see com.trade.dto), so unlike
// a JavaBean there is no request.setField(...) to mutate one field at a
// time. Instead each test below builds a whole new record with one field
// changed from the valid baseline, via the request(...) helper at the bottom.
class PlaceOrderRequestValidationTest {

    private static ValidatorFactory factory;
    private Validator validator;

    @BeforeAll
    static void beforeAll() {
        factory = Validation.buildDefaultValidatorFactory();
    }

    @BeforeEach
    void setUp() {
        validator = factory.getValidator();
    }

    @AfterAll
    static void afterAll() {
        factory.close();
    }

    @Test
    @DisplayName("A fully valid request should have no violations")
    void fullyValidRequestHasNoViolations() {
        assertTrue(validator.validate(validRequest()).isEmpty());
    }

    // ---------------- accountId ----------------

    @Test
    @DisplayName("Account ID is required")
    void accountIdRequired() {
        assertHasViolation(request(null, "AAPL", OrderSide.BUY, 10, "100.00", "ORDER-001"), "accountId");
    }

    @Test
    @DisplayName("Account ID of zero should be rejected")
    void accountIdZero() {
        assertHasViolation(request(0L, "AAPL", OrderSide.BUY, 10, "100.00", "ORDER-001"), "accountId");
    }

    @Test
    @DisplayName("Negative account ID should be rejected")
    void accountIdNegative() {
        assertHasViolation(request(-1L, "AAPL", OrderSide.BUY, 10, "100.00", "ORDER-001"), "accountId");
    }

    @Test
    @DisplayName("Account ID of one (the minimum) should be accepted")
    void accountIdMinimum() {
        assertNoViolation(request(1L, "AAPL", OrderSide.BUY, 10, "100.00", "ORDER-001"), "accountId");
    }

    // ---------------- symbol ----------------

    @Test
    @DisplayName("Symbol is required")
    void symbolRequired() {
        assertHasViolation(request(1L, null, OrderSide.BUY, 10, "100.00", "ORDER-001"), "symbol");
    }

    @Test
    @DisplayName("Blank symbol should be rejected")
    void symbolBlank() {
        assertHasViolation(request(1L, " ", OrderSide.BUY, 10, "100.00", "ORDER-001"), "symbol");
    }

    @Test
    @DisplayName("Symbol with 20 characters (the maximum) should be accepted")
    void symbolMaximum() {
        assertNoViolation(request(1L, "ABCDEFGHIJKLMNOPQRST", OrderSide.BUY, 10, "100.00", "ORDER-001"), "symbol");
    }

    @Test
    @DisplayName("Symbol with 21 characters should be rejected")
    void symbolTooLong() {
        assertHasViolation(request(1L, "ABCDEFGHIJKLMNOPQRSTU", OrderSide.BUY, 10, "100.00", "ORDER-001"), "symbol");
    }

    // ---------------- side ----------------

    @Test
    @DisplayName("Side is required")
    void sideRequired() {
        assertHasViolation(request(1L, "AAPL", null, 10, "100.00", "ORDER-001"), "side");
    }

    @Test
    @DisplayName("BUY side should be accepted")
    void buySide() {
        assertNoViolation(request(1L, "AAPL", OrderSide.BUY, 10, "100.00", "ORDER-001"), "side");
    }

    @Test
    @DisplayName("SELL side should be accepted")
    void sellSide() {
        assertNoViolation(request(1L, "AAPL", OrderSide.SELL, 10, "100.00", "ORDER-001"), "side");
    }

    // ---------------- quantity ----------------

    @Test
    @DisplayName("Quantity is required")
    void quantityRequired() {
        assertHasViolation(request(1L, "AAPL", OrderSide.BUY, null, "100.00", "ORDER-001"), "quantity");
    }

    @Test
    @DisplayName("Quantity of zero should be rejected")
    void quantityZero() {
        assertHasViolation(request(1L, "AAPL", OrderSide.BUY, 0, "100.00", "ORDER-001"), "quantity");
    }

    @Test
    @DisplayName("Negative quantity should be rejected")
    void quantityNegative() {
        assertHasViolation(request(1L, "AAPL", OrderSide.BUY, -1, "100.00", "ORDER-001"), "quantity");
    }

    @Test
    @DisplayName("Quantity of one (the minimum) should be accepted")
    void quantityMinimum() {
        assertNoViolation(request(1L, "AAPL", OrderSide.BUY, 1, "100.00", "ORDER-001"), "quantity");
    }

    // ---------------- price ----------------

    @Test
    @DisplayName("Price is required")
    void priceRequired() {
        assertHasViolation(request(1L, "AAPL", OrderSide.BUY, 10, null, "ORDER-001"), "price");
    }

    @Test
    @DisplayName("Price of zero should be rejected")
    void priceZero() {
        assertHasViolation(request(1L, "AAPL", OrderSide.BUY, 10, "0.00", "ORDER-001"), "price");
    }

    @Test
    @DisplayName("Negative price should be rejected")
    void priceNegative() {
        assertHasViolation(request(1L, "AAPL", OrderSide.BUY, 10, "-0.01", "ORDER-001"), "price");
    }

    @Test
    @DisplayName("Price with one decimal place should be accepted")
    void priceOneDecimal() {
        assertNoViolation(request(1L, "AAPL", OrderSide.BUY, 10, "100.1", "ORDER-001"), "price");
    }

    @Test
    @DisplayName("Price with two decimal places (the maximum) should be accepted")
    void priceTwoDecimals() {
        assertNoViolation(request(1L, "AAPL", OrderSide.BUY, 10, "100.12", "ORDER-001"), "price");
    }

    @Test
    @DisplayName("Price with more than two decimal places should be rejected")
    void priceTooManyDecimals() {
        assertHasViolation(request(1L, "AAPL", OrderSide.BUY, 10, "100.123", "ORDER-001"), "price");
    }

    // ---------------- idempotencyKey ----------------

    @Test
    @DisplayName("Idempotency key is required")
    void idempotencyKeyRequired() {
        assertHasViolation(request(1L, "AAPL", OrderSide.BUY, 10, "100.00", null), "idempotencyKey");
    }

    @Test
    @DisplayName("Idempotency key with 7 characters should be rejected")
    void idempotencyKeyTooShort() {
        assertHasViolation(request(1L, "AAPL", OrderSide.BUY, 10, "100.00", "1234567"), "idempotencyKey");
    }

    @Test
    @DisplayName("Idempotency key with 8 characters (the minimum) should be accepted")
    void idempotencyKeyMinimum() {
        assertNoViolation(request(1L, "AAPL", OrderSide.BUY, 10, "100.00", "12345678"), "idempotencyKey");
    }

    @Test
    @DisplayName("Idempotency key with 100 characters (the maximum) should be accepted")
    void idempotencyKeyMaximum() {
        assertNoViolation(request(1L, "AAPL", OrderSide.BUY, 10, "100.00", "a".repeat(100)), "idempotencyKey");
    }

    @Test
    @DisplayName("Idempotency key with 101 characters should be rejected")
    void idempotencyKeyTooLong() {
        assertHasViolation(request(1L, "AAPL", OrderSide.BUY, 10, "100.00", "a".repeat(101)), "idempotencyKey");
    }

    // ---------------- helpers ----------------

    private PlaceOrderRequestDto validRequest() {
        return request(1L, "AAPL", OrderSide.BUY, 10, "100.00", "ORDER-001");
    }

    // price is passed as a String and parsed here so every call site above
    // stays on one line; null is allowed through, for the "required" tests.
    private PlaceOrderRequestDto request(Long accountId, String symbol, OrderSide side,
                                          Integer quantity, String price, String idempotencyKey) {
        BigDecimal priceValue = price == null ? null : new BigDecimal(price);
        return new PlaceOrderRequestDto(accountId, symbol, side, quantity, priceValue, idempotencyKey);
    }

    private void assertHasViolation(PlaceOrderRequestDto request, String field) {
        Set<ConstraintViolation<PlaceOrderRequestDto>> violations = validator.validate(request);

        assertTrue(
                violations.stream().anyMatch(v -> v.getPropertyPath().toString().equals(field)),
                "Expected a validation error on " + field
        );
    }

    private void assertNoViolation(PlaceOrderRequestDto request, String field) {
        Set<ConstraintViolation<PlaceOrderRequestDto>> violations = validator.validate(request);

        assertFalse(
                violations.stream().anyMatch(v -> v.getPropertyPath().toString().equals(field)),
                "Did not expect a validation error on " + field
        );
    }
}
