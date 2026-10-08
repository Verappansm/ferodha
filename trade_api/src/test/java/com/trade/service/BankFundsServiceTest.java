package com.trade.service;

import com.trade.dto.BankFundsResponseDto;
import com.trade.dto.BankTransactionDto;
import com.trade.dto.BankTransactionsResponseDto;
import com.trade.dto.BankTransferRequestDto;
import com.trade.exception.InvalidParameterException;
import com.trade.exception.UnsupportedCurrencyException;
import com.trade.mapper.OpenBuyReservationRow;
import java.time.OffsetDateTime;
import java.util.List;
import com.trade.exception.AccountNotActiveException;
import com.trade.exception.BankTransferException;
import com.trade.exception.ConcurrentUpdateException;
import com.trade.exception.DuplicateBankTransferException;
import com.trade.mapper.AccountMapper;
import com.trade.mapper.BankFundsMapper;
import com.trade.mapper.BankFundsRow;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.bcrypt.BCrypt;

import java.math.BigDecimal;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// The bank transfer rules, against a mocked mapper. The PIN is checked exactly as
// in production: the browser's bcrypt proof is verified against a stored bcrypt of
// that proof.
class BankFundsServiceTest {

    // What the browser sends for PIN 1234 (BankComponent: bcrypt(PIN, PIN_PROOF_SALT)).
    private static final String PROOF_OF_1234 = "$2b$12$D6aOfmGWG4oQpLdkJ0PV.eoxub08hIXYphEVFFv9OlsB8EJNwktz.";
    private static final String WRONG_PROOF = BCrypt.hashpw("1111", "$2b$12$D6aOfmGWG4oQpLdkJ0PV.e");
    private static final String STORED = BCrypt.hashpw(PROOF_OF_1234, BCrypt.gensalt(4));
    private static final UUID ACCOUNT_UUID = UUID.fromString("11111111-1111-4111-8111-111111111111");

    private final BankFundsMapper bank = mock(BankFundsMapper.class);
    private final AccountMapper accounts = mock(AccountMapper.class);
    private final BankFundsService service = new BankFundsService(bank, accounts, new AccountAccessGuard());

    private static BankFundsRow row(String pinHash, String trading, String bankBalance, String status) {
        return row(pinHash, trading, bankBalance, status, "USD");
    }

    private static BankFundsRow row(String pinHash, String trading, String bankBalance, String status,
                                    String bankCurrency) {
        return new BankFundsRow(1L, ACCOUNT_UUID, "BANK-100001", pinHash, new BigDecimal(trading),
                new BigDecimal(bankBalance), "USD", bankCurrency, status, 7);
    }

    private static BankTransferRequestDto request(String amount, String proof) {
        return new BankTransferRequestDto(new BigDecimal(amount), proof, UUID.randomUUID());
    }

    @BeforeEach
    void setUp() {
        BankFundsRow row = row(STORED, "100.0000", "1000.0000", "ACTIVE");
        when(bank.findAndLockByAccountId(1L)).thenReturn(row);
        when(bank.findByAccountId(1L)).thenReturn(row);
        when(bank.debitBank(anyString(), any())).thenReturn(1);
        when(bank.creditBank(anyString(), any())).thenReturn(1);
        when(accounts.updateBalanceWithVersion(anyLong(), any(), anyInt())).thenReturn(1);
    }

    @Test
    @DisplayName("A deposit moves the amount from the bank to the trading balance and records it")
    void deposit() throws Exception {
        BankTransferRequestDto request = request("50.00", PROOF_OF_1234);

        BankFundsResponseDto result = service.deposit(1L, 1L, request);

        verify(bank).debitBank("BANK-100001", new BigDecimal("50.0000"));
        verify(accounts).updateBalanceWithVersion(1L, new BigDecimal("150.0000"), 7);
        verify(bank).insertTransaction(ACCOUNT_UUID, "DEPOSIT", new BigDecimal("50.0000"), request.idempotencyKey());
        assertEquals("BANK-100001", result.bankAccountNumber());
    }

    @Test
    @DisplayName("A withdrawal moves the amount from the trading balance to the bank")
    void withdraw() throws Exception {
        BankTransferRequestDto request = request("40.00", PROOF_OF_1234);

        service.withdraw(1L, 1L, request);

        verify(accounts).updateBalanceWithVersion(1L, new BigDecimal("60.0000"), 7);
        verify(bank).creditBank("BANK-100001", new BigDecimal("40.0000"));
        verify(bank).insertTransaction(ACCOUNT_UUID, "WITHDRAWAL", new BigDecimal("40.0000"), request.idempotencyKey());
    }

    @Test
    @DisplayName("A wrong PIN is a plain refusal and nothing moves")
    void wrongPin() {
        assertThrows(BankTransferException.class, () -> service.deposit(1L, 1L, request("50.00", WRONG_PROOF)));
        verify(bank, never()).debitBank(anyString(), any());
        verify(accounts, never()).updateBalanceWithVersion(anyLong(), any(), anyInt());
    }

    @Test
    @DisplayName("An account with no real PIN ('not-set', as an operator opens them) refuses, it does not error")
    void noPinSet() {
        when(bank.findAndLockByAccountId(1L)).thenReturn(row("not-set", "100.0000", "1000.0000", "ACTIVE"));
        assertThrows(BankTransferException.class, () -> service.deposit(1L, 1L, request("50.00", PROOF_OF_1234)));
        verify(bank, never()).debitBank(anyString(), any());
    }

    @Test
    @DisplayName("Not enough in the bank to deposit, or in the account to withdraw, is refused")
    void insufficientFunds() {
        assertThrows(BankTransferException.class, () -> service.deposit(1L, 1L, request("5000.00", PROOF_OF_1234)));
        assertThrows(BankTransferException.class, () -> service.withdraw(1L, 1L, request("100.01", PROOF_OF_1234)));
        verify(bank, never()).creditBank(anyString(), any());
    }

    @Test
    @DisplayName("A key that was already used is BNK-409, and the transfer is not kept")
    void repeatedKey() throws Exception {
        when(bank.insertTransaction(any(), anyString(), any(), any())).thenThrow(new DuplicateKeyException("uq"));
        assertThrows(DuplicateBankTransferException.class,
                () -> service.deposit(1L, 1L, request("50.00", PROOF_OF_1234)));
    }

    @Test
    @DisplayName("A balance that changed under the transfer is a conflict, not a half transfer")
    void concurrentUpdate() {
        when(accounts.updateBalanceWithVersion(anyLong(), any(), anyInt())).thenReturn(0);
        assertThrows(ConcurrentUpdateException.class,
                () -> service.deposit(1L, 1L, request("50.00", PROOF_OF_1234)));
    }

    @Test
    @DisplayName("Another customer's account, or one that is not active, is refused")
    void accessAndStatus() {
        assertThrows(AccountNotActiveException.class, () -> service.deposit(1L, 2L, request("5.00", PROOF_OF_1234)));
        assertThrows(AccountNotActiveException.class, () -> service.funds(1L, 2L));

        when(bank.findAndLockByAccountId(1L)).thenReturn(row(STORED, "100.0000", "1000.0000", "SUSPENDED"));
        assertThrows(AccountNotActiveException.class, () -> service.deposit(1L, 1L, request("5.00", PROOF_OF_1234)));
        verify(bank, never()).debitBank(eq("BANK-100001"), any());
    }

    @Test
    @DisplayName("Cash an open buy order may still spend cannot be withdrawn, and the balance says so")
    void openBuysHoldCashBack() throws Exception {
        // 5 units at 10.00 with a 0.1% fee: 50.05 held back from the 100.00 balance.
        when(bank.openBuyReservations(ACCOUNT_UUID)).thenReturn(List.of(new OpenBuyReservationRow(
                new BigDecimal("10.00"), new BigDecimal("5"), new BigDecimal("0.001"), "USD")));

        assertEquals(new BigDecimal("49.95"), service.funds(1L, 1L).availableToWithdraw());
        assertThrows(BankTransferException.class, () -> service.withdraw(1L, 1L, request("50.00", PROOF_OF_1234)));
        verify(bank, never()).creditBank(anyString(), any());

        service.withdraw(1L, 1L, request("49.95", PROOF_OF_1234));
        verify(bank).creditBank("BANK-100001", new BigDecimal("49.9500"));
    }

    @Test
    @DisplayName("An INR order on a USD account holds back its value converted at the fixed rate")
    void openBuysInAnotherCurrency() throws Exception {
        // 90 INR is 1 USD: 900 INR at a zero fee holds back 10.00 USD.
        when(bank.openBuyReservations(ACCOUNT_UUID)).thenReturn(List.of(new OpenBuyReservationRow(
                new BigDecimal("90.00"), new BigDecimal("10"), BigDecimal.ZERO, "INR")));

        assertEquals(new BigDecimal("90.00"), service.funds(1L, 1L).availableToWithdraw());
    }

    @Test
    @DisplayName("A bank held in another currency than the account is refused: money never moves one for one across currencies")
    void currencyMismatch() {
        when(bank.findAndLockByAccountId(1L)).thenReturn(row(STORED, "100.0000", "1000.0000", "ACTIVE", "INR"));
        assertThrows(UnsupportedCurrencyException.class,
                () -> service.deposit(1L, 1L, request("50.00", PROOF_OF_1234)));
        verify(bank, never()).debitBank(anyString(), any());
    }

    @Test
    @DisplayName("Transactions are a page of the account's movements, only for its own customer")
    void transactions() throws Exception {
        BankTransactionDto movement = new BankTransactionDto(UUID.randomUUID(), "DEPOSIT",
                new BigDecimal("50.0000"), "USD", OffsetDateTime.parse("2026-10-08T10:00:00Z"));
        when(bank.findTransactions(1L, 20, 0)).thenReturn(List.of(movement));
        when(bank.countTransactions(1L)).thenReturn(1L);

        BankTransactionsResponseDto page = service.transactions(1L, 1L, 20, 0);
        assertEquals(List.of(movement), page.transactions());
        assertEquals(1L, page.total());

        assertThrows(AccountNotActiveException.class, () -> service.transactions(1L, 2L, 20, 0));
        assertThrows(InvalidParameterException.class, () -> service.transactions(1L, 1L, 0, 0));
    }
}
