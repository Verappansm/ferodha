package com.trade.service;

import com.trade.mapper.AccountMapper;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;

/**
 * The one way a module outside the accounts layer finds a user's trading account, so no
 * module reads the Accounts table itself (Sprint 10: modules meet only at published
 * interfaces).
 */
@Component
public class AccountDirectory {

    private final AccountMapper accountMapper;

    public AccountDirectory(AccountMapper accountMapper) {
        this.accountMapper = accountMapper;
    }

    public Optional<Long> tradingAccountOf(UUID userId) {
        return accountMapper.findIdByUserId(userId);
    }
}
