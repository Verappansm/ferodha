package com.trade.service;

import com.trade.domain.Account;
import com.trade.domain.AccountRepository;
import com.trade.enums.AccountStatus;
import com.trade.mapper.AccountMapper;
import com.trade.mapper.AccountRow;
import org.springframework.stereotype.Component;

import java.util.Optional;

// Adapts the MyBatis AccountMapper to the domain's AccountRepository seam.
// This is the only place a persistence-layer AccountRow becomes a
// domain.Account - OrderLogic never sees a row, a mapper or SQL.
@Component
public class AccountRepositoryImpl implements AccountRepository {

    private final AccountMapper accountMapper;

    public AccountRepositoryImpl(AccountMapper accountMapper) {
        this.accountMapper = accountMapper;
    }

    @Override
    public Optional<Account> findById(Long accountId) {
        if (accountId == null) {
            return Optional.empty();
        }
        return accountMapper.findById(accountId).map(AccountRepositoryImpl::toDomain);
    }

    static Account toDomain(AccountRow row) {
        return new Account(
                row.id(),
                row.businessRef(),
                row.holderName(),
                row.cashBalance(),
                AccountStatus.valueOf(row.status()),
                row.version()
        );
    }
}
