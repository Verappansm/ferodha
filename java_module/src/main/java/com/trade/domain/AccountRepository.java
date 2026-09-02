package com.trade.domain;

import java.util.Optional;

public interface AccountRepository {

    Optional<Account> findById(Long accountId);
}
