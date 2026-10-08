package com.trade.service;

import com.trade.dto.BankFundsResponseDto;
import com.trade.dto.BankTransactionsResponseDto;
import com.trade.dto.BankTransferRequestDto;
import com.trade.enums.AccountStatus;
import com.trade.exception.AccountNotActiveException;
import com.trade.exception.AccountNotFoundException;
import com.trade.exception.BankTransferException;
import com.trade.exception.ConcurrentUpdateException;
import com.trade.exception.DomainException;
import com.trade.exception.InvalidParameterException;
import com.trade.exception.UnsupportedCurrencyException;
import com.trade.mapper.AccountMapper;
import com.trade.mapper.BankFundsMapper;
import com.trade.mapper.BankFundsRow;
import com.trade.mapper.OpenBuyReservationRow;
import com.trade.service.currency.CurrencyConversion;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import com.trade.exception.DuplicateBankTransferException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.bcrypt.BCrypt;

/** Moves value only between an account and its database-linked bank account. */
@Service
public class BankFundsService {
    static final int MAX_TRANSACTIONS_PAGE = 100;

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
        return response(row, availableToWithdraw(row));
    }

    /** LEAP-019: the account's cash movements, newest first, a page at a time. */
    @Transactional(readOnly = true)
    public BankTransactionsResponseDto transactions(long accountId, Long callerAccountId, int limit, int offset)
            throws DomainException {
        accessGuard.requireTokenMatches(accountId, callerAccountId);
        if (limit < 1 || limit > MAX_TRANSACTIONS_PAGE) throw new InvalidParameterException("limit");
        if (offset < 0) throw new InvalidParameterException("offset");
        BankFundsRow row = bankFundsMapper.findByAccountId(accountId);
        if (row == null) throw new AccountNotFoundException(accountId);
        return new BankTransactionsResponseDto(
                bankFundsMapper.findTransactions(accountId, limit, offset),
                bankFundsMapper.countTransactions(accountId), limit, offset);
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
        // Money moves one for one only within one currency; an account opened before the
        // bank recorded its currency could disagree with it (approval now prevents that).
        if (!row.currency().equals(row.bankCurrency())) {
            throw new UnsupportedCurrencyException(row.bankCurrency(), row.currency());
        }
        if (!pinMatches(request.pinHash(), row.pinHash())) throw new BankTransferException();

        BigDecimal amount = request.amount().setScale(4, RoundingMode.UNNECESSARY);
        // A withdrawal may take only the cash no open buy order is still waiting to spend.
        BigDecimal sourceBalance = deposit ? row.bankBalance() : availableToWithdraw(row);
        if (sourceBalance.compareTo(amount) < 0) throw new BankTransferException();

        // Debit first, then credit. Every update and the immutable audit entry are one database
        // transaction, so a failed write (including a duplicate key) rolls every leg back.
        if (deposit) {
            if (bankFundsMapper.debitBank(row.bankAccountNumber(), amount) != 1) throw new BankTransferException();
            updateTradingBalance(row, row.tradingBalance().add(amount));
            recordTransaction(row, "DEPOSIT", amount, request);
        } else {
            updateTradingBalance(row, row.tradingBalance().subtract(amount));
            if (bankFundsMapper.creditBank(row.bankAccountNumber(), amount) != 1) throw new BankTransferException();
            recordTransaction(row, "WITHDRAWAL", amount, request);
        }
        return funds(accountId, callerAccountId);
    }

    /**
     * The trading cash less what the open buy orders may still spend: each one's unfilled
     * quantity at its limit price plus its fee, in the account currency. The executor fills a
     * buy at the ask, never above the limit, so this is the most those orders can take.
     */
    BigDecimal availableToWithdraw(BankFundsRow row) {
        BigDecimal reserved = BigDecimal.ZERO;
        for (OpenBuyReservationRow order : bankFundsMapper.openBuyReservations(row.accountUuid())) {
            if (order.remainingQuantity().signum() <= 0) continue;
            BigDecimal value = order.limitPrice().multiply(order.remainingQuantity());
            BigDecimal accountValue = CurrencyConversion.tryConvert(
                    value, order.instrumentCurrency(), row.currency()).orElse(value);
            reserved = reserved.add(accountValue.add(accountValue.multiply(order.feeRate())));
        }
        BigDecimal available = row.tradingBalance().subtract(CurrencyConversion.money(reserved));
        return available.signum() < 0 ? BigDecimal.ZERO.setScale(2) : CurrencyConversion.money(available);
    }

    // A bank row with no usable PIN ('not-set' on every account an operator opened,
    // or a placeholder) cannot be bcrypt-checked, and must read as a plain refusal
    // rather than an error: the answer never says which part was wrong.
    private static boolean pinMatches(String proof, String stored) {
        try {
            return BCrypt.checkpw(proof, stored);
        } catch (IllegalArgumentException notABcryptHash) {
            return false;
        }
    }

    // The unique index on the key is the guard: a browser retry of a transfer that
    // already went through collides here, and the whole transfer rolls back.
    private void recordTransaction(BankFundsRow row, String type, BigDecimal amount, BankTransferRequestDto request)
            throws DuplicateBankTransferException {
        try {
            bankFundsMapper.insertTransaction(row.accountUuid(), type, amount, request.idempotencyKey());
        } catch (DataIntegrityViolationException e) {
            throw new DuplicateBankTransferException();
        }
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

    private static BankFundsResponseDto response(BankFundsRow row, BigDecimal availableToWithdraw) {
        return new BankFundsResponseDto(row.accountId(), row.bankAccountNumber(), row.tradingBalance(),
                row.bankBalance(), availableToWithdraw, row.currency(), OffsetDateTime.now());
    }
}
