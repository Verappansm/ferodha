package com.trade.service;

import com.trade.dto.AccountResponseDto;
import com.trade.dto.BalanceResponseDto;
import com.trade.dto.OrderHistoryEntryDto;
import com.trade.dto.PositionResponseDto;
import com.trade.enums.AccountStatus;
import com.trade.enums.OrderSide;
import com.trade.enums.OrderStatus;
import com.trade.exception.AccountNotFoundException;
import com.trade.exception.DomainException;
import com.trade.mapper.AccountMapper;
import com.trade.mapper.AccountRow;
import com.trade.mapper.OrderMapper;
import com.trade.mapper.PositionMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;

// The four account read operations. These are pure projections of what is
// already stored - there is no business rule to enforce, only ACC-404 and
// ACC-403, so this talks to the mappers directly rather than through the
// domain's repository seam (that seam exists for OrderLogic, which needs a
// domain.Account to evaluate rules against; a read endpoint needs a row it
// can shape into a DTO).
@Service
@Transactional(readOnly = true)
public class AccountService {

    private final AccountMapper accountMapper;
    private final PositionMapper positionMapper;
    private final OrderMapper orderMapper;
    private final AccountAccessGuard accessGuard;

    public AccountService(AccountMapper accountMapper, PositionMapper positionMapper,
                           OrderMapper orderMapper, AccountAccessGuard accessGuard) {
        this.accountMapper = accountMapper;
        this.positionMapper = positionMapper;
        this.orderMapper = orderMapper;
        this.accessGuard = accessGuard;
    }

    public AccountResponseDto getAccount(long accountId, Long callerAccountId) throws DomainException {
        AccountRow row = loadAccessible(accountId, callerAccountId);
        return new AccountResponseDto(
                row.id(),
                row.businessRef(),
                row.holderName(),
                row.cashBalance(),
                AccountStatus.valueOf(row.status()),
                row.version(),
                row.lastUpdated()
        );
    }

    public BalanceResponseDto getBalance(long accountId, Long callerAccountId) throws DomainException {
        AccountRow row = loadAccessible(accountId, callerAccountId);
        return new BalanceResponseDto(row.id(), row.cashBalance(), row.currency(), OffsetDateTime.now());
    }

    public List<PositionResponseDto> getPositions(long accountId, Long callerAccountId) throws DomainException {
        loadAccessible(accountId, callerAccountId);
        return positionMapper.findAllForAccount(accountId).stream()
                .map(row -> new PositionResponseDto(
                        row.accountId(),
                        row.symbol(),
                        Math.toIntExact(row.quantity()),
                        row.averageCost()))
                .toList();
    }

    public List<OrderHistoryEntryDto> getOrderHistory(long accountId, Long callerAccountId,
                                                        OrderStatus status, OffsetDateTime from, OffsetDateTime to)
            throws DomainException {
        loadAccessible(accountId, callerAccountId);
        String statusFilter = status == null ? null : status.name();
        return orderMapper.findHistory(accountId, statusFilter, from, to).stream()
                .map(row -> new OrderHistoryEntryDto(
                        "ORD-" + row.orderId(),
                        row.accountId(),
                        row.symbol(),
                        OrderSide.valueOf(row.side()),
                        row.quantity(),
                        row.price(),
                        row.executedPrice(),
                        OrderStatus.valueOf(row.status()),
                        row.idempotencyKey(),
                        row.createdOn()))
                .toList();
    }

    private AccountRow loadAccessible(long accountId, Long callerAccountId) throws DomainException {
        AccountRow row = accountMapper.findById(accountId)
                .orElseThrow(() -> new AccountNotFoundException(accountId));
        accessGuard.requireActiveAndMatches(row, callerAccountId);
        return row;
    }
}
