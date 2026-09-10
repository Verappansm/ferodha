package com.trade.service;

import com.trade.enums.AccountStatus;
import com.trade.exception.AccountNotActiveException;
import com.trade.mapper.AccountRow;

import org.springframework.stereotype.Component;

// Centralises the ACC-403 decision so every endpoint answers it the same
// way. Per contracts/trade-api.yaml, ACC-403 covers two different causes -
// the account is not ACTIVE, or the caller's token does not reach it - and
// deliberately returns the identical body for both, so that nobody can use
// the response to enumerate account keys or probe account status.
//
// This lives outside the filter on purpose: JwtAuthFilter only proves the
// token is genuine, before it is known which account a request addresses.
@Component
public class AccountAccessGuard {

    // Use where the account has not been loaded yet (e.g. before evaluating
    // the domain rules on an order), to catch a token/account mismatch
    // early. The account's own ACTIVE check still happens separately -
    // OrderLogic's rule 2 for order placement, requireActiveAndMatches(...)
    // for the read endpoints and for cancellation.
    public void requireTokenMatches(Long addressedAccountId, Long callerAccountId) throws AccountNotActiveException {
        if (callerAccountId == null || !callerAccountId.equals(addressedAccountId)) {
            throw new AccountNotActiveException(addressedAccountId, null);
        }
    }

    public void requireActiveAndMatches(AccountRow account, Long callerAccountId) throws AccountNotActiveException {
        requireTokenMatches(account.id(), callerAccountId);
        if (!AccountStatus.ACTIVE.name().equals(account.status())) {
            throw new AccountNotActiveException(account.id(), AccountStatus.valueOf(account.status()));
        }
    }
}
