package com.trade.admin.service;

import com.trade.admin.AdminException;
import com.trade.admin.dto.AdminDtos.FeeByCurrencyDto;
import com.trade.admin.dto.AdminDtos.FeeInstrumentDto;
import com.trade.admin.dto.AdminDtos.FeeSummaryDto;
import com.trade.admin.dto.AdminDtos.FeeUserDto;
import com.trade.admin.dto.AdminDtos.PageDto;
import com.trade.admin.mapper.AdminMapper;
import com.trade.admin.mapper.FeeCurrencyRow;
import com.trade.admin.mapper.FeeInstrumentRow;
import com.trade.admin.mapper.FeeUserRow;
import com.trade.service.portfolio.FixedFxRates;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

// The commission the platform has taken: the sum of Orders.fee_amount over
// filled portal orders (the executor writes it when it fills an order, at the
// rate that order was accepted at). Accounts are in USD or INR, so every total
// is shown in USD, converting INR at the same fixed 90 INR = 1 USD the executor
// settles at; the unconverted per-currency figures are returned alongside, and
// a currency that cannot be converted is left out of the USD totals and flagged
// (partial) rather than summed as if it were dollars.
@Service
@Transactional(readOnly = true)
public class AdminFeeService {

    static final String BASE = "USD";
    private static final int SCALE = 2;

    private final AdminMapper mapper;
    private final Clock clock;

    @Autowired
    public AdminFeeService(AdminMapper mapper) {
        this(mapper, Clock.systemUTC());
    }

    AdminFeeService(AdminMapper mapper, Clock clock) {
        this.mapper = mapper;
        this.clock = clock;
    }

    public FeeSummaryDto summary() {
        LocalDate monthStart = LocalDate.now(clock.withZone(ZoneOffset.UTC)).withDayOfMonth(1);
        List<FeeCurrencyRow> allTime = mapper.feeTotalsByCurrency(null, null);
        List<FeeCurrencyRow> thisMonth = mapper.feeTotalsByCurrency(monthStart, null);

        boolean partial = false;
        BigDecimal total = BigDecimal.ZERO;
        long orders = 0;
        for (FeeCurrencyRow row : allTime) {
            orders += row.orders();
            Optional<BigDecimal> usd = toUsd(row.fees(), row.currency());
            if (usd.isPresent()) {
                total = total.add(usd.get());
            } else {
                partial = true;
            }
        }
        BigDecimal month = BigDecimal.ZERO;
        for (FeeCurrencyRow row : thisMonth) {
            month = month.add(toUsd(row.fees(), row.currency()).orElse(BigDecimal.ZERO));
        }
        return new FeeSummaryDto(BASE, money(total), money(month), orders,
                allTime.stream().map(r -> new FeeByCurrencyDto(r.currency(), r.orders(), money(r.fees()))).toList(),
                partial);
    }

    public PageDto<FeeUserDto> byUser(LocalDate from, LocalDate to, String q, Paging paging) {
        checkRange(from, to);
        String query = Paging.blankToNull(q);
        List<FeeUserDto> items = mapper.feesByUser(from, to, query, FixedFxRates.inrPerUsd(),
                        paging.offset(), paging.size()).stream()
                .map(r -> new FeeUserDto(r.userId(), r.name(), r.email(), r.accountId(), r.currency(), r.orders(),
                        money(r.fees()), toUsd(r.fees(), r.currency()).map(AdminFeeService::money).orElse(null)))
                .toList();
        return new PageDto<>(items, paging.page(), paging.size(), mapper.countFeeUsers(from, to, query));
    }

    // Every instrument that has earned a fee, largest first, in USD.
    public List<FeeInstrumentDto> byInstrument(LocalDate from, LocalDate to) {
        checkRange(from, to);
        Map<String, FeeInstrumentDto> bySymbol = new HashMap<>();
        for (FeeInstrumentRow row : mapper.feesByInstrument(from, to)) {
            BigDecimal usd = toUsd(row.fees(), row.currency()).orElse(BigDecimal.ZERO);
            bySymbol.merge(row.symbol(), new FeeInstrumentDto(row.symbol(), row.name(), row.orders(), usd),
                    (a, b) -> new FeeInstrumentDto(a.symbol(), a.name(), a.orders() + b.orders(),
                            a.feesUsd().add(b.feesUsd())));
        }
        return bySymbol.values().stream()
                .map(d -> new FeeInstrumentDto(d.symbol(), d.name(), d.orders(), money(d.feesUsd())))
                .sorted(Comparator.comparing(FeeInstrumentDto::feesUsd).reversed()
                        .thenComparing(FeeInstrumentDto::symbol))
                .toList();
    }

    private static void checkRange(LocalDate from, LocalDate to) {
        if (from != null && to != null && from.isAfter(to)) {
            throw AdminException.invalid("from after to");
        }
    }

    private static Optional<BigDecimal> toUsd(BigDecimal amount, String currency) {
        return FixedFxRates.convert(amount, currency, BASE);
    }

    private static BigDecimal money(BigDecimal amount) {
        return amount.setScale(SCALE, RoundingMode.HALF_UP);
    }
}
