package com.trade.domain;

import com.trade.enums.AccountStatus;

import java.math.BigDecimal;
import java.math.RoundingMode;

// One client's trading account: a cash balance, a holder, a trading status,
// and the only operations (credit/debit) allowed to move that balance
public class Account {

    // Two identifiers, on purpose, because they mean different things:
    //   - accountId is the numeric key. It is what "accountId" means in
    //     contracts/trade-api.yaml, in the JWT claim, and on every Order.
    //   - accountRef is a string a human support call would read out loud.
    // They are never interchangeable, so we keep them as two separate fields
    // instead of one "id" that gets reused for both purposes
    private final Long accountId;
    private final String accountRef;

    private final String holderName;
    private BigDecimal balance;
    private AccountStatus status;

    //The domain itself never increments this or takes a lock - it just remembers the
    // version it was loaded at, and reports it back
    private final long version;

    // Convenience constructor for tests: a fresh ACTIVE account with a zero
    // balance and no identifiers, so a test can focus on one behaviour
    // (credit, debit, affordability) without other fields
    public Account() {
        this(null, null, null, BigDecimal.ZERO, AccountStatus.ACTIVE, 0L);
    }

    public Account(Long accountId, String accountRef, String holderName,
                    BigDecimal balance, AccountStatus status, long version) {
        this.accountId = accountId;
        this.accountRef = accountRef;
        this.holderName = holderName;
        this.balance = scaleToMoney(balance);
        this.status = status;
        this.version = version;
    }

    // Adds money to the balance
    public void credit(BigDecimal amount) {
        requirePositiveAmount(amount);
        balance = scaleToMoney(balance.add(amount));
    }

    // Removes money from the balance
    public void debit(BigDecimal amount) {
        requirePositiveAmount(amount);
        if (!isAffordable(amount)) {
            throw new IllegalArgumentException(
                    "Debiting " + amount + " would leave the balance negative");
        }
        balance = scaleToMoney(balance.subtract(amount));
    }

    // Used directly by OrderLogic's rule 6 (can this account afford this BUY)
    public boolean isAffordable(BigDecimal amount) {
        return balance.compareTo(amount) >= 0;
    }

    public boolean isActive() {
        return status == AccountStatus.ACTIVE;
    }

    private void requirePositiveAmount(BigDecimal amount) {
        if (amount == null || amount.signum() <= 0) {
            throw new IllegalArgumentException("Amount must be greater than zero");
        }
    }

    private static BigDecimal scaleToMoney(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    public Long getAccountId() {
        return accountId;
    }

    public String getAccountRef() {
        return accountRef;
    }

    public String getHolderName() {
        return holderName;
    }

    public BigDecimal getBalance() {
        return balance;
    }

    public AccountStatus getStatus() {
        return status;
    }

    public long getVersion() {
        return version;
    }
}
