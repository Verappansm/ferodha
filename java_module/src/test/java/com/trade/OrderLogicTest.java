package com.trade;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class OrderLogicTest {

    private OrderLogic orderLogic;

    @BeforeEach
    void setUp() {
        orderLogic = new OrderLogic();
    }

    @Test
    @DisplayName("Rule 1: should reject order when account does not exist")
    void accountNotFound() {
        Order order = validOrder();

        // account does not exist

        OrderException exception = assertThrows(
                OrderException.class,
                () -> orderLogic.evaluate(order)
        );

        assertEquals("ACC-404", exception.getCode());
    }

    @Test
    @DisplayName("Rule 1: should continue when account exists")
    void accountExists() {
        Order order = validOrder();

        // add existing account
        assertDoesNotThrow(
                () -> orderLogic.evaluate(order)
        );
    }

    @Test
    @DisplayName("Rule 2: should reject order when account is not ACTIVE")
    void accountNotActive() {
        Order order = validOrder();

        // add SUSPENDED or CLOSED account
        OrderException exception = assertThrows(
                OrderException.class,
                () -> orderLogic.evaluate(order)
        );

        assertEquals("ACC-403", exception.getCode());
    }

    @Test
    @DisplayName("Rule 2: should continue when account is ACTIVE")
    void accountActive() {
        Order order = validOrder();

        // add ACTIVE account
        assertDoesNotThrow(
                () -> orderLogic.evaluate(order)
        );
    }

    @Test
    @DisplayName("Rule 3: should reject order when instrument does not exist")
    void instrumentNotFound() {
        Order order = validOrder();

        // add ACTIVE account
        // instrument does not exist
        OrderException exception = assertThrows(
                OrderException.class,
                () -> orderLogic.evaluate(order)
        );

        assertEquals("INS-404", exception.getCode());
    }

    @Test
    @DisplayName("Rule 3: should reject order when instrument is not tradable")
    void instrumentNotTradable() {
        Order order = validOrder();

        // add ACTIVE account
        // add instrument that is not tradable
        OrderException exception = assertThrows(
                OrderException.class,
                () -> orderLogic.evaluate(order)
        );

        assertEquals("INS-404", exception.getCode());
    }

    @Test
    @DisplayName("Rule 3: should continue when instrument exists and is tradable")
    void instrumentTradable() {
        Order order = validOrder();

        // add ACTIVE account
        // add tradable instrument
        assertDoesNotThrow(
                () -> orderLogic.evaluate(order)
        );
    }

    @Test
    @DisplayName("Rule 6: should reject BUY when funds are insufficient")
    void buyInsufficientFunds() {
        Order order = validBuyOrder();

        // add ACTIVE account
        // add tradable instrument
        // account has less cash than quantity * price
        OrderException exception = assertThrows(
                OrderException.class,
                () -> orderLogic.evaluate(order)
        );

        assertEquals("ORD-400", exception.getCode());
    }

    @Test
    @DisplayName("Rule 6: should allow BUY when funds are sufficient")
    void buySufficientFunds() {
        Order order = validBuyOrder();

        // add ACTIVE account
        // add tradable instrument
        // account has enough cash for quantity * price

        assertDoesNotThrow(
                () -> orderLogic.evaluate(order)
        );
    }

    @Test
    @DisplayName("Rule 7: should reject SELL when holdings are insufficient")
    void sellInsufficientHoldings() {
        Order order = validSellOrder();

        // add ACTIVE account
        // add tradable instrument
        // account holds less than order quantity
        OrderException exception = assertThrows(
                OrderException.class,
                () -> orderLogic.evaluate(order)
        );

        assertEquals("ORD-409", exception.getCode());
    }

    @Test
    @DisplayName("Rule 7: should allow SELL when holdings are sufficient")
    void sellSufficientHoldings() {
        Order order = validSellOrder();

        // add ACTIVE account
        // add tradable instrument
        // account holds enough quantity
        assertDoesNotThrow(
                () -> orderLogic.evaluate(order)
        );
    }

    @Test
    @DisplayName("Rule 8: should reject order when idempotency key was already used")
    void duplicateOrder() {
        Order order = validOrder();

        // add ACTIVE account
        // add tradable instrument
        // idempotency key has already been accepted
        OrderException exception = assertThrows(
                OrderException.class,
                () -> orderLogic.evaluate(order)
        );

        assertEquals("ORD-409", exception.getCode());
    }

    @Test
    @DisplayName("Rule 8: should allow order when idempotency key is new")
    void newIdempotencyKey() {
        Order order = validOrder();

        // add ACTIVE account
        // add tradable instrument
        // idempotency key has not been used
        assertDoesNotThrow(
                () -> orderLogic.evaluate(order)
        );
    }

    @Test
    @DisplayName("Rules should be evaluated in the defined order")
    void evaluationOrder() {
        Order order = validOrder();

        // Deliberately create multiple failures.
        // Account does not exist.
        // Other fields/rules are also invalid.
        OrderException exception = assertThrows(
                OrderException.class,
                () -> orderLogic.evaluate(order)
        );

        // Rule 1 must be evaluated before the later rules.
        assertEquals("ACC-404", exception.getCode());
    }

    private Order validOrder() {
        Order order = new Order();

        order.setAccountId(1L);
        order.setSymbol("AAPL");
        order.setQuantity(10);
        order.setPrice(100);
        order.setIdempotencyKey("ORDER-001");

        return order;
    }

    private Order validBuyOrder() {
        Order order = validOrder();
        order.setSide(Order.Side.BUY);
        return order;
    }

    private Order validSellOrder() {
        Order order = validOrder();
        order.setSide(Order.Side.SELL);
        return order;
    }
}