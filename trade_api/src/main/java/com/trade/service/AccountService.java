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
import com.trade.mapper.OrderHistoryRow;
import com.trade.mapper.OrderMapper;
import com.trade.mapper.OrderTradeFillRow;
import com.trade.mapper.PositionMapper;
import com.trade.service.currency.CurrencyConversion;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

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
        List<OrderHistoryRow> rows = orderMapper.findHistory(accountId, statusFilter, from, to);
        if (rows.isEmpty()) {
            return List.of();
        }
        Map<UUID, List<OrderTradeFillRow>> fillsByOrder = orderMapper.findHistoryFills(
                        rows.stream().map(OrderHistoryRow::orderId).toList()).stream()
                .collect(Collectors.groupingBy(OrderTradeFillRow::orderId));
        return rows.stream().map(row -> {
                    List<OrderTradeFillRow> fills = fillsByOrder.getOrDefault(row.orderId(), List.of());
                    // A pair the fixed policy has no rate for (e.g. a EUR
                    // account) must not fail the whole history: the
                    // account-currency figures are left null for that row.
                    boolean convertible = CurrencyConversion.isSupported(
                            row.instrumentCurrency(), row.accountCurrency());
                    BigDecimal feeRate = row.feeRate() != null ? row.feeRate() : BigDecimal.ZERO;
                    boolean isBuySide = "BUY".equals(row.side());
                    BigDecimal instrumentValue = BigDecimal.ZERO;
                    BigDecimal accountValue = BigDecimal.ZERO;
                    BigDecimal instrumentFee = BigDecimal.ZERO;
                    BigDecimal cashAmount = BigDecimal.ZERO;
                    for (OrderTradeFillRow fill : fills) {
                        BigDecimal fillValue = fill.executionPrice().multiply(fill.executionQuantity());
                        instrumentValue = instrumentValue.add(fillValue);
                        instrumentFee = instrumentFee.add(CurrencyConversion.money(fillValue.multiply(feeRate)));
                        if (convertible) {
                            BigDecimal fillAccountValue = CurrencyConversion.convert(
                                    fillValue, row.instrumentCurrency(), row.accountCurrency());
                            accountValue = accountValue.add(fillAccountValue);
                            BigDecimal fillFee = CurrencyConversion.money(fillAccountValue.multiply(feeRate));
                            cashAmount = cashAmount.add(CurrencyConversion.money(
                                    isBuySide ? fillAccountValue.add(fillFee) : fillAccountValue.subtract(fillFee)));
                        }
                    }
                    BigDecimal estimatedValue = row.price() == null || row.quantity() == null
                            ? (convertible ? BigDecimal.ZERO : null)
                            : CurrencyConversion.tryConvert(
                                row.price().multiply(BigDecimal.valueOf(row.quantity())),
                                row.instrumentCurrency(), row.accountCurrency()).orElse(null);
                    boolean showAccountFills = !fills.isEmpty() && convertible;
                    return new OrderHistoryEntryDto(
                        "ORD-" + row.orderId(),
                        row.accountId(),
                        row.symbol(),
                        row.side() != null ? OrderSide.valueOf(row.side()) : OrderSide.BUY,
                        row.quantity(),
                        row.price(),
                        row.executedPrice(),
                        OrderStatus.valueOf(row.status()),
                        row.idempotencyKey(),
                        row.createdOn(),
                        row.rejectionReason(),
                        row.instrumentCurrency(),
                        row.accountCurrency(),
                        fills.stream().mapToInt(fill -> fill.executionQuantity().intValue()).sum(),
                        fills.isEmpty() ? null : CurrencyConversion.money(instrumentValue),
                        showAccountFills ? CurrencyConversion.money(accountValue) : null,
                        fills.isEmpty() ? null : CurrencyConversion.money(instrumentFee),
                        row.feeAmount(),
                        showAccountFills ? CurrencyConversion.money(cashAmount) : null,
                        estimatedValue == null ? null : CurrencyConversion.money(estimatedValue));
                })
                .toList();
    }

    private AccountRow loadAccessible(long accountId, Long callerAccountId) throws DomainException {
        AccountRow row = accountMapper.findById(accountId)
                .orElseThrow(() -> new AccountNotFoundException(accountId));
        accessGuard.requireActiveAndMatches(row, callerAccountId);
        return row;
    }
}
