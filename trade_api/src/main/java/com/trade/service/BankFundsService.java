package com.trade.service;

import com.trade.dto.BankFundsResponseDto;
import com.trade.dto.BankTransferRequestDto;
import com.trade.enums.AccountStatus;
import com.trade.exception.AccountNotActiveException;
import com.trade.exception.AccountNotFoundException;
import com.trade.exception.BankTransferException;
import com.trade.exception.ConcurrentUpdateException;
import com.trade.exception.DomainException;
import com.trade.mapper.AccountMapper;
import com.trade.mapper.BankFundsMapper;
import com.trade.mapper.BankFundsRow;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import org.springframework.security.crypto.bcrypt.BCrypt;

/** Moves value only between an account and its database-linked bank account. */
@Service
public class BankFundsService {
    private final BankFundsMapper bankFundsMapper;
    private final AccountMapper accountMapper;
    private final AccountAccessGuard accessGuard;

    public BankFundsService(BankFundsMapper bankFundsMapper, AccountMapper accountMapper,
                            AccountAccessGuard accessGuard) {
        this.bankFundsMapper = bankFundsMapper;
        this.accountMapper = accountMapper;
        this.accessGuard = accessGuard;
    }

    @Transactional(readOnly = true)
    public BankFundsResponseDto funds(long accountId, Long callerAccountId) throws DomainException {
        accessGuard.requireTokenMatches(accountId, callerAccountId);
        BankFundsRow row = bankFundsMapper.findByAccountId(accountId);
        if (row == null) throw new AccountNotFoundException(accountId);
        requireActive(row);
        return response(row);
    }

    // DomainException is checked in this codebase; rollbackFor is therefore essential.
    // Without it, a late refusal could commit one leg of a transfer.
    @Transactional(rollbackFor = Exception.class)
    public BankFundsResponseDto deposit(long accountId, Long callerAccountId, BankTransferRequestDto request)
            throws DomainException {
        return transfer(accountId, callerAccountId, request, true);
    }

    @Transactional(rollbackFor = Exception.class)
    public BankFundsResponseDto withdraw(long accountId, Long callerAccountId, BankTransferRequestDto request)
            throws DomainException {
        return transfer(accountId, callerAccountId, request, false);
    }

    private BankFundsResponseDto transfer(long accountId, Long callerAccountId, BankTransferRequestDto request,
                                          boolean deposit) throws DomainException {
        accessGuard.requireTokenMatches(accountId, callerAccountId);
        BankFundsRow row = bankFundsMapper.findAndLockByAccountId(accountId);
        if (row == null) throw new AccountNotFoundException(accountId);
        requireActive(row);
        if (!BCrypt.checkpw(request.pinHash(), row.pinHash())) throw new BankTransferException();

        BigDecimal amount = request.amount().setScale(4, RoundingMode.UNNECESSARY);
        BigDecimal sourceBalance = deposit ? row.bankBalance() : row.tradingBalance();
        if (sourceBalance.compareTo(amount) < 0) throw new BankTransferException();

        // Debit first, then credit. Every update and the immutable audit entry are one database
        // transaction, so a failed write (including a duplicate key) rolls every leg back.
        if (deposit) {
            if (bankFundsMapper.debitBank(row.bankAccountNumber(), amount) != 1) throw new BankTransferException();
            updateTradingBalance(row, row.tradingBalance().add(amount));
            bankFundsMapper.insertTransaction(row.accountUuid(), "DEPOSIT", amount, request.idempotencyKey());
        } else {
            updateTradingBalance(row, row.tradingBalance().subtract(amount));
            if (bankFundsMapper.creditBank(row.bankAccountNumber(), amount) != 1) throw new BankTransferException();
            bankFundsMapper.insertTransaction(row.accountUuid(), "WITHDRAWAL", amount, request.idempotencyKey());
        }
        return funds(accountId, callerAccountId);
    }

    private void updateTradingBalance(BankFundsRow row, BigDecimal newBalance) throws ConcurrentUpdateException {
        if (accountMapper.updateBalanceWithVersion(row.accountId(), newBalance, row.version()) != 1) {
            throw new ConcurrentUpdateException(row.accountId());
        }
    }

    private static void requireActive(BankFundsRow row) throws AccountNotActiveException {
        if (!AccountStatus.ACTIVE.name().equals(row.status())) {
            throw new AccountNotActiveException(row.accountId(), AccountStatus.valueOf(row.status()));
        }
    }

    private static BankFundsResponseDto response(BankFundsRow row) {
        return new BankFundsResponseDto(row.accountId(), row.bankAccountNumber(), row.tradingBalance(),
                row.bankBalance(), row.currency(), OffsetDateTime.now());
    }
}
