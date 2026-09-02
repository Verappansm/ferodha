package com.trade;

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

class PlaceOrderRequestValidationTest {

    private static ValidatorFactory factory;
    private Validator validator;
    private PlaceOrderRequest request;

    @BeforeAll
    static void beforeAll() {
        factory = Validation.buildDefaultValidatorFactory();
    }

    @BeforeEach
    void setUp() {
        validator = factory.getValidator();
        request = validRequest();
    }

    @AfterAll
    static void afterAll() {
        factory.close();
    }

    @Test
    @DisplayName("Valid request should have no validation errors")
    void validRequest() {
        assertTrue(validator.validate(request).isEmpty());
    }

    // ---------------- accountId ----------------

    @Test
    @DisplayName("Account ID is required")
    void accountIdRequired() {
        request.setAccountId(null);

        assertHasViolation("accountId");
    }

    @Test
    @DisplayName("Account ID of zero should be rejected")
    void accountIdZero() {
        request.setAccountId(0L);

        assertHasViolation("accountId");
    }

    @Test
    @DisplayName("Negative account ID should be rejected")
    void accountIdNegative() {
        request.setAccountId(-1L);

        assertHasViolation("accountId");
    }

    @Test
    @DisplayName("Account ID of one should be accepted")
    void accountIdMinimum() {
        request.setAccountId(1L);

        assertNoViolation("accountId");
    }

    // ---------------- symbol ----------------

    @Test
    @DisplayName("Symbol is required")
    void symbolRequired() {
        request.setSymbol(null);

        assertHasViolation("symbol");
    }

    @Test
    @DisplayName("Blank symbol should be rejected")
    void symbolBlank() {
        request.setSymbol(" ");

        assertHasViolation("symbol");
    }

    @Test
    @DisplayName("Symbol with 20 characters should be accepted")
    void symbolMaximum() {
        request.setSymbol("ABCDEFGHIJKLMNOPQRST");

        assertNoViolation("symbol");
    }

    @Test
    @DisplayName("Symbol with 21 characters should be rejected")
    void symbolTooLong() {
        request.setSymbol("ABCDEFGHIJKLMNOPQRSTU");

        assertHasViolation("symbol");
    }

    // ---------------- side ----------------

    @Test
    @DisplayName("Side is required")
    void sideRequired() {
        request.setSide(null);

        assertHasViolation("side");
    }

    @Test
    @DisplayName("BUY side should be accepted")
    void buySide() {
        request.setSide("BUY");

        assertNoViolation("side");
    }

    @Test
    @DisplayName("SELL side should be accepted")
    void sellSide() {
        request.setSide("SELL");

        assertNoViolation("side");
    }

    // ---------------- quantity ----------------

    @Test
    @DisplayName("Quantity is required")
    void quantityRequired() {
        request.setQuantity(null);

        assertHasViolation("quantity");
    }

    @Test
    @DisplayName("Quantity of zero should be rejected")
    void quantityZero() {
        request.setQuantity(BigDecimal.ZERO);

        assertHasViolation("quantity");
    }

    @Test
    @DisplayName("Negative quantity should be rejected")
    void quantityNegative() {
        request.setQuantity(new BigDecimal("-1"));

        assertHasViolation("quantity");
    }

    @Test
    @DisplayName("Quantity of one should be accepted")
    void quantityMinimum() {
        request.setQuantity(BigDecimal.ONE);

        assertNoViolation("quantity");
    }

    @Test
    @DisplayName("Fractional quantity should be rejected")
    void quantityFractional() {
        request.setQuantity(new BigDecimal("10.5"));

        assertHasViolation("quantity");
    }

    // ---------------- price ----------------

    @Test
    @DisplayName("Price is required")
    void priceRequired() {
        request.setPrice(null);

        assertHasViolation("price");
    }

    @Test
    @DisplayName("Price of zero should be rejected")
    void priceZero() {
        request.setPrice(BigDecimal.ZERO);

        assertHasViolation("price");
    }

    @Test
    @DisplayName("Negative price should be rejected")
    void priceNegative() {
        request.setPrice(new BigDecimal("-0.01"));

        assertHasViolation("price");
    }

    @Test
    @DisplayName("Price with one decimal place should be accepted")
    void priceOneDecimal() {
        request.setPrice(new BigDecimal("100.1"));

        assertNoViolation("price");
    }

    @Test
    @DisplayName("Price with two decimal places should be accepted")
    void priceTwoDecimals() {
        request.setPrice(new BigDecimal("100.12"));

        assertNoViolation("price");
    }

    @Test
    @DisplayName("Price with more than two decimal places should be rejected")
    void priceTooManyDecimals() {
        request.setPrice(new BigDecimal("100.123"));

        assertHasViolation("price");
    }

    // ---------------- idempotencyKey ----------------

    @Test
    @DisplayName("Idempotency key is required")
    void idempotencyKeyRequired() {
        request.setIdempotencyKey(null);

        assertHasViolation("idempotencyKey");
    }

    @Test
    @DisplayName("Idempotency key with 7 characters should be rejected")
    void idempotencyKeyTooShort() {
        request.setIdempotencyKey("1234567");

        assertHasViolation("idempotencyKey");
    }

    @Test
    @DisplayName("Idempotency key with 8 characters should be accepted")
    void idempotencyKeyMinimum() {
        request.setIdempotencyKey("12345678");

        assertNoViolation("idempotencyKey");
    }

    @Test
    @DisplayName("Idempotency key with 100 characters should be accepted")
    void idempotencyKeyMaximum() {
        request.setIdempotencyKey("a".repeat(100));

        assertNoViolation("idempotencyKey");
    }

    @Test
    @DisplayName("Idempotency key with 101 characters should be rejected")
    void idempotencyKeyTooLong() {
        request.setIdempotencyKey("a".repeat(101));

        assertHasViolation("idempotencyKey");
    }

    // ---------------- helpers ----------------

    private PlaceOrderRequest validRequest() {
        PlaceOrderRequest request = new PlaceOrderRequest();

        request.setAccountId(1L);
        request.setSymbol("AAPL");
        request.setSide("BUY");
        request.setQuantity(BigDecimal.TEN);
        request.setPrice(new BigDecimal("100.00"));
        request.setIdempotencyKey("ORDER-001");

        return request;
    }

    private void assertHasViolation(String field) {
        Set<ConstraintViolation<PlaceOrderRequest>> violations =
                validator.validate(request);

        assertTrue(
                violations.stream()
                        .anyMatch(v ->
                                v.getPropertyPath()
                                        .toString()
                                        .equals(field)),
                "Expected validation error on " + field
        );
    }

    private void assertNoViolation(String field) {
        Set<ConstraintViolation<PlaceOrderRequest>> violations =
                validator.validate(request);

        assertFalse(
                violations.stream()
                        .anyMatch(v ->
                                v.getPropertyPath()
                                        .toString()
                                        .equals(field)),
                "Did not expect validation error on " + field
        );
    }
}