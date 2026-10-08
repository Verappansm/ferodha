package com.trade.signal;

import com.trade.exception.InstrumentNotFoundException;
import com.trade.mapper.MarketHistoryMapper;
import com.trade.mapper.PriceBarRow;
import com.trade.service.MarketDataService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Trade advice and signals (Sprint 10 stretch). Reads the daily candles the executor's price
 * feed already stores (market_candles), so it spends no Fauxnance quota and holds no key.
 * Candles change once a day, so each symbol's signal is kept for {@code signal.cache-minutes}
 * (default 60) instead of being recomputed per request or per quote. It informs; it never
 * places an order.
 */
@Service
public class SignalService {

    /** Enough calendar days to hold 50 trading days, with weekends and holidays. */
    static final int LOOKBACK_DAYS = 100;

    public static final String DISCLAIMER =
            "A statistical indicator from past daily prices, not investment advice. It does not "
                    + "know about news, earnings or your own situation.";

    private final MarketDataService marketData;
    private final MarketHistoryMapper history;
    private final Duration cacheFor;
    private final Clock clock;
    private final Map<String, SignalDto> cache = new ConcurrentHashMap<>();

    @Autowired
    public SignalService(MarketDataService marketData, MarketHistoryMapper history,
                         @Value("${signal.cache-minutes:60}") long cacheMinutes) {
        this(marketData, history, Duration.ofMinutes(cacheMinutes), Clock.systemUTC());
    }

    SignalService(MarketDataService marketData, MarketHistoryMapper history, Duration cacheFor, Clock clock) {
        this.marketData = marketData;
        this.history = history;
        this.cacheFor = cacheFor;
        this.clock = clock;
    }

    public SignalDto signal(String rawSymbol) throws InstrumentNotFoundException {
        String symbol = rawSymbol.trim().toUpperCase(Locale.ROOT);
        marketData.getTradableInstrument(symbol);
        Instant now = clock.instant();
        SignalDto cached = cache.get(symbol);
        if (cached != null && cached.computedAt().toInstant().plus(cacheFor).isAfter(now)) {
            return cached;
        }
        LocalDate from = LocalDate.ofInstant(now, ZoneOffset.UTC).minusDays(LOOKBACK_DAYS);
        List<PriceBarRow> candles = history.findDailyCandles(symbol, from);
        List<BigDecimal> closes = candles.stream().map(PriceBarRow::close).toList();
        SignalCalculator.Result result = SignalCalculator.evaluate(closes);
        SignalDto dto = new SignalDto(symbol, result.direction().name(), result.strength().name(),
                result.reason(), result.smaFast(), result.smaSlow(), result.rsi(), result.lastClose(),
                result.closesUsed(),
                candles.isEmpty() ? null : candles.get(candles.size() - 1).time(),
                OffsetDateTime.ofInstant(now, ZoneOffset.UTC), DISCLAIMER);
        cache.put(symbol, dto);
        return dto;
    }
}
