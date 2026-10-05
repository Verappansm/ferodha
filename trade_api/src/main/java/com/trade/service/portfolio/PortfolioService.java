package com.trade.service.portfolio;

import com.trade.dto.portfolio.PnlResponseDto;
import com.trade.dto.portfolio.PortfolioSummaryDto;
import com.trade.dto.portfolio.PricedPositionDto;
import com.trade.dto.portfolio.SymbolPnlDto;
import com.trade.exception.AccountNotFoundException;
import com.trade.exception.DomainException;
import com.trade.exception.InvalidDateRangeException;
import com.trade.exception.PricingUnavailableException;
import com.trade.mapper.AccountMapper;
import com.trade.mapper.AccountRow;
import com.trade.mapper.FillRow;
import com.trade.mapper.PortfolioMapper;
import com.trade.mapper.StoredPriceRow;
import com.trade.service.AccountAccessGuard;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;

// contracts/portfolio-api.yaml: priced holdings and profit and loss.
//
// Quantity, average cost and realised P&L come from replaying the account's
// fills in the order they happened, using the contract's definitions: a buy
// re-weights the average cost, a sell leaves it unchanged and books
// (fillPrice - averageCostAtSale) x quantitySold. Realised P&L therefore
// depends only on fill prices, never on today's price.
//
// Last prices come from LatestQuotes (the market-data topic), falling back
// to the newest stored minute bar or daily candle. A price older than the freshness
// window is still shown, flagged stale; a holding with no price at all has
// null price fields and marks the summary partial. Only when no holding can
// be priced does a route answer MKT-503.
@Service
@Transactional(readOnly = true)
public class PortfolioService {

    static final int WORKING_SCALE = 10;
    static final RoundingMode ROUNDING = RoundingMode.HALF_UP;
    private static final int MONEY_SCALE = 4;
    private static final int PERCENT_SCALE = 2;
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private final AccountMapper accountMapper;
    private final PortfolioMapper portfolioMapper;
    private final AccountAccessGuard accessGuard;
    private final LatestQuotes latestQuotes;
    private final Duration staleAfter;
    private final Clock clock;

    @Autowired
    public PortfolioService(AccountMapper accountMapper, PortfolioMapper portfolioMapper,
                            AccountAccessGuard accessGuard, LatestQuotes latestQuotes,
                            @Value("${portfolio.quotes.stale-after-seconds:300}") long staleAfterSeconds) {
        this(accountMapper, portfolioMapper, accessGuard, latestQuotes,
                Duration.ofSeconds(staleAfterSeconds), Clock.systemUTC());
    }

    PortfolioService(AccountMapper accountMapper, PortfolioMapper portfolioMapper,
                     AccountAccessGuard accessGuard, LatestQuotes latestQuotes,
                     Duration staleAfter, Clock clock) {
        this.accountMapper = accountMapper;
        this.portfolioMapper = portfolioMapper;
        this.accessGuard = accessGuard;
        this.latestQuotes = latestQuotes;
        this.staleAfter = staleAfter;
        this.clock = clock;
    }

    public PortfolioSummaryDto getPortfolioSummary(long accountId, Long callerAccountId) throws DomainException {
        AccountRow account = loadAccessible(accountId, callerAccountId);
        String base = account.currency();
        Map<String, Holding> holdings = replay(accountId, null, null);
        List<Valuation> valuations = price(accountId, open(holdings, null));

        BigDecimal marketValue = BigDecimal.ZERO;
        BigDecimal costBasis = BigDecimal.ZERO;
        BigDecimal pricedCostBasis = BigDecimal.ZERO;
        boolean partial = false;
        for (Valuation valuation : valuations) {
            Optional<BigDecimal> cost = FixedFxRates.convert(valuation.costBasis(), valuation.currency(), base);
            Optional<BigDecimal> value = FixedFxRates.convert(valuation.marketValue(), valuation.currency(), base);
            if (cost.isEmpty()) {
                partial = true;
                continue;
            }
            costBasis = costBasis.add(cost.get());
            if (value.isEmpty()) {
                partial = true;
                continue;
            }
            pricedCostBasis = pricedCostBasis.add(cost.get());
            marketValue = marketValue.add(value.get());
        }
        BigDecimal unrealised = marketValue.subtract(pricedCostBasis);
        RealisedTotal realised = realisedIn(base, holdings.values());

        return new PortfolioSummaryDto(
                account.id(),
                base,
                account.cashBalance(),
                money(marketValue),
                money(costBasis),
                money(unrealised),
                percent(unrealised, pricedCostBasis),
                money(realised.amount()),
                money(account.cashBalance().add(marketValue)),
                valuations.size(),
                partial || realised.partial(),
                now());
    }

    public List<PricedPositionDto> getPricedPositions(long accountId, Long callerAccountId, String symbol)
            throws DomainException {
        loadAccessible(accountId, callerAccountId);
        Map<String, Holding> holdings = replay(accountId, null, null);
        return price(accountId, open(holdings, symbol)).stream()
                .map(valuation -> new PricedPositionDto(
                        accountId,
                        valuation.holding().symbol,
                        valuation.holding().quantity.intValue(),
                        money(valuation.holding().averageCost),
                        money(valuation.costBasis()),
                        money(valuation.lastPrice()),
                        money(valuation.marketValue()),
                        money(valuation.unrealisedPnl()),
                        valuation.lastPrice() == null ? null : percent(valuation.unrealisedPnl(), valuation.costBasis()),
                        valuation.currency(),
                        valuation.priceAsOf(),
                        valuation.stale()))
                .toList();
    }

    public PnlResponseDto getPnl(long accountId, Long callerAccountId, LocalDate from, LocalDate to,
                                 boolean bySymbol) throws DomainException {
        AccountRow account = loadAccessible(accountId, callerAccountId);
        if (from != null && to != null && from.isAfter(to)) {
            throw new InvalidDateRangeException(from, to);
        }
        String base = account.currency();
        Map<String, Holding> holdings = replay(accountId, from, to);
        Map<String, BigDecimal> unrealisedBySymbol = new HashMap<>();
        for (Valuation valuation : price(accountId, open(holdings, null))) {
            FixedFxRates.convert(valuation.unrealisedPnl(), valuation.currency(), base)
                    .ifPresent(amount -> unrealisedBySymbol.put(valuation.holding().symbol, amount));
        }

        BigDecimal unrealised = unrealisedBySymbol.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal realised = realisedIn(base, holdings.values()).amount();

        List<SymbolPnlDto> breakdown = null;
        if (bySymbol) {
            breakdown = new ArrayList<>();
            for (Holding holding : holdings.values()) {
                BigDecimal symbolRealised = FixedFxRates.convert(holding.realised, holding.currency, base)
                        .orElse(BigDecimal.ZERO);
                BigDecimal symbolUnrealised = unrealisedBySymbol.getOrDefault(holding.symbol, BigDecimal.ZERO);
                if (symbolRealised.signum() == 0 && !holding.isOpen()) {
                    continue;
                }
                breakdown.add(new SymbolPnlDto(holding.symbol, money(symbolRealised), money(symbolUnrealised),
                        money(symbolRealised.add(symbolUnrealised))));
            }
        }

        return new PnlResponseDto(
                account.id(),
                base,
                from,
                to,
                money(realised),
                money(unrealised),
                money(realised.add(unrealised)),
                breakdown,
                now());
    }

    // The contract compares the token's accountId with the path before it
    // reads anything, so probing another account's key is always ACC-403,
    // never ACC-404.
    private AccountRow loadAccessible(long accountId, Long callerAccountId) throws DomainException {
        accessGuard.requireTokenMatches(accountId, callerAccountId);
        AccountRow account = accountMapper.findById(accountId)
                .orElseThrow(() -> new AccountNotFoundException(accountId));
        accessGuard.requireActiveAndMatches(account, callerAccountId);
        return account;
    }

    // Replays every fill, oldest first. Realised P&L is only accumulated for
    // sales booked inside [from, to] (UTC dates, either bound optional), but
    // every fill moves quantity and average cost whatever its date.
    private Map<String, Holding> replay(long accountId, LocalDate from, LocalDate to) {
        Map<String, Holding> holdings = new TreeMap<>();
        for (FillRow fill : portfolioMapper.findFills(accountId)) {
            Holding holding = holdings.computeIfAbsent(fill.symbol(), symbol -> new Holding(symbol, fill.currency()));
            if ("BUY".equals(fill.side())) {
                holding.buy(fill.quantity(), fill.price());
            } else {
                holding.sell(fill.quantity(), fill.price(), within(fill.executedAt(), from, to));
            }
        }
        return holdings;
    }

    private static boolean within(OffsetDateTime executedAt, LocalDate from, LocalDate to) {
        if (from == null && to == null) {
            return true;
        }
        if (executedAt == null) {
            return false;
        }
        LocalDate day = executedAt.atZoneSameInstant(ZoneOffset.UTC).toLocalDate();
        return (from == null || !day.isBefore(from)) && (to == null || !day.isAfter(to));
    }

    private static List<Holding> open(Map<String, Holding> holdings, String symbol) {
        return holdings.values().stream()
                .filter(Holding::isOpen)
                .filter(holding -> symbol == null || symbol.isEmpty() || holding.symbol.equals(symbol))
                .toList();
    }

    private List<Valuation> price(long accountId, List<Holding> holdings) throws PricingUnavailableException {
        if (holdings.isEmpty()) {
            return List.of();
        }
        Map<String, LatestQuotes.Quote> quotes = new HashMap<>();
        List<String> unquoted = new ArrayList<>();
        for (Holding holding : holdings) {
            latestQuotes.find(holding.symbol).ifPresentOrElse(
                    quote -> quotes.put(holding.symbol, quote),
                    () -> unquoted.add(holding.symbol));
        }
        if (!unquoted.isEmpty()) {
            for (StoredPriceRow row : portfolioMapper.findLatestStoredPrices(unquoted)) {
                quotes.put(row.symbol(), new LatestQuotes.Quote(row.price(), row.asOf()));
            }
        }
        if (quotes.isEmpty()) {
            throw new PricingUnavailableException(accountId, holdings.size());
        }

        OffsetDateTime freshAfter = now().minus(staleAfter);
        List<Valuation> valuations = new ArrayList<>();
        for (Holding holding : holdings) {
            LatestQuotes.Quote quote = quotes.get(holding.symbol);
            if (quote == null) {
                valuations.add(new Valuation(holding, null, null, true));
            } else {
                boolean stale = quote.asOf() == null || quote.asOf().isBefore(freshAfter);
                valuations.add(new Valuation(holding, quote.price(), quote.asOf(), stale));
            }
        }
        return valuations;
    }

    private static RealisedTotal realisedIn(String base, Collection<Holding> holdings) {
        BigDecimal total = BigDecimal.ZERO;
        boolean partial = false;
        for (Holding holding : holdings) {
            Optional<BigDecimal> converted = FixedFxRates.convert(holding.realised, holding.currency, base);
            if (converted.isPresent()) {
                total = total.add(converted.get());
            } else {
                partial = true;
            }
        }
        return new RealisedTotal(total, partial);
    }

    private OffsetDateTime now() {
        return OffsetDateTime.now(clock).withOffsetSameInstant(ZoneOffset.UTC);
    }

    private static BigDecimal money(BigDecimal amount) {
        return amount == null ? null : amount.setScale(MONEY_SCALE, ROUNDING);
    }

    // Percentage points against cost basis; null when there is no cost basis.
    private static BigDecimal percent(BigDecimal pnl, BigDecimal costBasis) {
        if (pnl == null || costBasis == null || costBasis.signum() == 0) {
            return null;
        }
        return pnl.multiply(HUNDRED).divide(costBasis, PERCENT_SCALE, ROUNDING);
    }

    private record RealisedTotal(BigDecimal amount, boolean partial) {
    }

    // One open holding with its price, or with nulls when it has none.
    private record Valuation(Holding holding, BigDecimal lastPrice, OffsetDateTime priceAsOf, boolean stale) {

        String currency() {
            return holding.currency;
        }

        BigDecimal costBasis() {
            return holding.quantity.multiply(holding.averageCost);
        }

        BigDecimal marketValue() {
            return lastPrice == null ? null : holding.quantity.multiply(lastPrice);
        }

        BigDecimal unrealisedPnl() {
            return lastPrice == null ? null : marketValue().subtract(costBasis());
        }
    }

    // The running state of one instrument during the replay.
    private static final class Holding {

        private final String symbol;
        private final String currency;
        private BigDecimal quantity = BigDecimal.ZERO;
        private BigDecimal averageCost = BigDecimal.ZERO;
        private BigDecimal realised = BigDecimal.ZERO;

        private Holding(String symbol, String currency) {
            this.symbol = symbol;
            this.currency = currency;
        }

        private boolean isOpen() {
            return quantity.signum() > 0;
        }

        // (oldQty * oldAvg + newQty * fillPrice) / (oldQty + newQty)
        private void buy(BigDecimal filled, BigDecimal price) {
            BigDecimal newQuantity = quantity.add(filled);
            averageCost = quantity.multiply(averageCost).add(filled.multiply(price))
                    .divide(newQuantity, WORKING_SCALE, ROUNDING);
            quantity = newQuantity;
        }

        // Books (fillPrice - averageCostAtSale) * quantitySold; the average
        // cost itself is unchanged. Placement never lets a sale exceed the
        // holding, but the replay caps it anyway rather than go short.
        private void sell(BigDecimal filled, BigDecimal price, boolean book) {
            BigDecimal sold = filled.min(quantity);
            if (book) {
                realised = realised.add(price.subtract(averageCost).multiply(sold));
            }
            quantity = quantity.subtract(sold);
            if (quantity.signum() == 0) {
                averageCost = BigDecimal.ZERO;
            }
        }
    }
}
