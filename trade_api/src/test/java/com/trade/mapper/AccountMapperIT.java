package com.trade.mapper;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AccountMapperIT extends MapperIntegrationTestSupport {

    @Autowired
    private AccountMapper accountMapper;

    @Test
    @DisplayName("account and positions read correctly")
    void accountIsReadCorrectly() {
        long accountId = insertAccount("account-read@example.com", "BANK-READ-1", new BigDecimal("15000.00"));

        Optional<AccountRow> result = accountMapper.findById(accountId);

        assertTrue(result.isPresent());
        AccountRow row = result.get();
        assertEquals(accountId, row.id());
        assertEquals("Test Holder", row.holderName());
        assertEquals(0, new BigDecimal("15000.00").compareTo(row.cashBalance()));
        assertEquals("ACTIVE", row.status());
        assertEquals(0, row.version());
        assertEquals("USD", row.currency());
    }

    @Test
    @DisplayName("an unknown account key reads as empty rather than throwing")
    void unknownAccountReadsAsEmpty() {
        assertTrue(accountMapper.findById(999_999_999L).isEmpty());
    }

    @Test
    @DisplayName("mapper reports the affected row count rather than returning void")
    void optimisticLockUpdateReportsAffectedRowCount() {
        long accountId = insertAccount("account-lock@example.com", "BANK-LOCK-1", new BigDecimal("5000.00"));

        int affected = accountMapper.updateBalanceWithVersion(accountId, new BigDecimal("3000.00"), 0);

        assertEquals(1, affected);
        AccountRow updated = accountMapper.findById(accountId).orElseThrow();
        assertEquals(0, new BigDecimal("3000.00").compareTo(updated.cashBalance()));
        assertEquals(1, updated.version());
    }

    @Test
    @DisplayName("a stale version affects zero rows rather than silently overwriting a concurrent write")
    void staleVersionAffectsZeroRows() {
        long accountId = insertAccount("account-stale@example.com", "BANK-STALE-1", new BigDecimal("5000.00"));
        // Advances the row to version 1, simulating a write that has
        // already happened since this test's caller last read the account.
        accountMapper.updateBalanceWithVersion(accountId, new BigDecimal("4000.00"), 0);

        int affected = accountMapper.updateBalanceWithVersion(accountId, new BigDecimal("1000.00"), 0);

        assertEquals(0, affected);
        AccountRow unchanged = accountMapper.findById(accountId).orElseThrow();
        assertEquals(0, new BigDecimal("4000.00").compareTo(unchanged.cashBalance()));
        assertEquals(1, unchanged.version());
    }
}
