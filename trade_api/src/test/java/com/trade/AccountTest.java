package com.trade;

import com.trade.domain.Account;
import com.trade.enums.AccountStatus;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

class AccountTest {

    private Account account;

    @BeforeEach
    void setUp() {
        account = new Account();
    }

    @Test
    @DisplayName("Account should have ACTIVE status when created")
    void status() {
        assertEquals(AccountStatus.ACTIVE, account.getStatus());
        assertTrue(account.isActive());
    }

    @Test
    @DisplayName("A SUSPENDED account is not active")
    void suspendedIsNotActive() {
        Account suspended = new Account(1L, "REF-1", "Jane Doe",
                BigDecimal.ZERO, AccountStatus.SUSPENDED, 0L);

        assertFalse(suspended.isActive());
    }

    @Test
    @DisplayName("Credit should increase the account balance")
    void credit() {
        account.credit(new BigDecimal("100.00"));

        assertEquals(new BigDecimal("100.00"), account.getBalance());
    }

    @Test
    @DisplayName("Debit should reduce the account balance")
    void debit() {
        account.credit(new BigDecimal("100.00"));

        account.debit(new BigDecimal("30.00"));

        assertEquals(new BigDecimal("70.00"), account.getBalance());
    }

    @Test
    @DisplayName("Crediting a non-positive amount should be rejected")
    void creditNonPositive() {
        assertThrows(
                IllegalArgumentException.class,
                () -> account.credit(BigDecimal.ZERO)
        );
    }

    @Test
    @DisplayName("Debiting a non-positive amount should be rejected")
    void debitNonPositive() {
        assertThrows(
                IllegalArgumentException.class,
                () -> account.debit(new BigDecimal("-10.00"))
        );
    }

    @Test
    @DisplayName("Account should be affordable when balance is sufficient")
    void affordable() {
        account.credit(new BigDecimal("100.00"));

        assertTrue(account.isAffordable(new BigDecimal("75.00")));
    }

    @Test
    @DisplayName("Account should not be affordable when balance is insufficient")
    void notAffordable() {
        account.credit(new BigDecimal("100.00"));

        assertFalse(account.isAffordable(new BigDecimal("150.00")));
    }

    @Test
    @DisplayName("Debit should be refused when it would make the balance negative")
    void negativeDebit() {
        account.credit(new BigDecimal("100.00"));

        assertThrows(
                IllegalArgumentException.class,
                () -> account.debit(new BigDecimal("150.00"))
        );

        // The refused debit must not have changed the balance at all.
        assertEquals(new BigDecimal("100.00"), account.getBalance());
    }

    @Test
    @DisplayName("Balance should not drift after many small operations")
    void balanceDrift() {
        account.credit(new BigDecimal("1000.00"));

        for (int i = 0; i < 10_000; i++) {
            account.debit(new BigDecimal("0.01"));
            account.credit(new BigDecimal("0.01"));
        }

        assertEquals(new BigDecimal("1000.00"), account.getBalance());
    }
}
