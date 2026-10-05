package com.trade.service;

import com.trade.dto.AccountResponseDto;
import com.trade.enums.AccountStatus;
import com.trade.exception.AccountNotActiveException;
import com.trade.exception.AccountNotFoundException;
import com.trade.mapper.AccountMapper;
import com.trade.mapper.AccountRow;
import com.trade.mapper.OrderHistoryRow;
import com.trade.mapper.OrderMapper;
import com.trade.mapper.PositionMapper;
import com.trade.mapper.PositionRow;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AccountServiceTest {

    private static final UUID ACCOUNT_UUID = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static final UUID USER_UUID = UUID.fromString("11111111-1111-1111-1111-111111111111");

    private final AccountMapper accountMapper = mock(AccountMapper.class);
    private final PositionMapper positionMapper = mock(PositionMapper.class);
    private final OrderMapper orderMapper = mock(OrderMapper.class);

    private AccountService accountService;

    @BeforeEach
    void setUp() {
        accountService = new AccountService(accountMapper, positionMapper, orderMapper, new AccountAccessGuard());
    }

    @Test
    @DisplayName("Account, balance, positions and order history are all returned for an accessible account")
    void returnsDetailsForAnAccessibleAccount() throws Exception {
        givenAccount(AccountStatus.ACTIVE);
        when(positionMapper.findAllForAccount(1L)).thenReturn(List.of(
                new PositionRow(1L, "AAPL", 20L, new BigDecimal("150.00"))));
        when(orderMapper.findHistory(1L, null, null, null)).thenReturn(List.of(
                new OrderHistoryRow(UUID.randomUUID(), 1L, "AAPL", "BUY", 20,
                        new BigDecimal("150.00"), new BigDecimal("150.00"), "FILLED", "KEY-1", OffsetDateTime.now())));

        AccountResponseDto account = accountService.getAccount(1L, 1L);
        assertEquals("ACC-000001", account.accountId());
        assertEquals(AccountStatus.ACTIVE, account.status());

        assertEquals(new BigDecimal("5000.00"), accountService.getBalance(1L, 1L).cashBalance());
        assertEquals(1, accountService.getPositions(1L, 1L).size());
        assertEquals(1, accountService.getOrderHistory(1L, 1L, null, null, null).size());
    }

    @Test
    @DisplayName("An unknown account returns ACC-404")
    void unknownAccountReturnsAccountNotFound() {
        when(accountMapper.findById(99L)).thenReturn(Optional.empty());

        assertThrows(AccountNotFoundException.class, () -> accountService.getAccount(99L, 99L));
    }

    @Test
    @DisplayName("A SUSPENDED account returns ACC-403 even to its own owner")
    void suspendedAccountReturnsAccountNotActive() {
        givenAccount(AccountStatus.SUSPENDED);

        assertThrows(AccountNotActiveException.class, () -> accountService.getAccount(1L, 1L));
    }

    @Test
    @DisplayName("A token whose accountId does not match the requested account returns ACC-403")
    void tokenNotReachingTheAccountReturnsAccountNotActive() {
        givenAccount(AccountStatus.ACTIVE);

        assertThrows(AccountNotActiveException.class, () -> accountService.getAccount(1L, 2L));
    }

    private void givenAccount(AccountStatus status) {
        when(accountMapper.findById(1L)).thenReturn(Optional.of(new AccountRow(
                1L, ACCOUNT_UUID, "ACC-000001", USER_UUID, "Test Holder", new BigDecimal("5000.00"),
                status.name(), 3, OffsetDateTime.now(), "USD")));
    }
}
