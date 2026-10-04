package com.trade.service;

import com.trade.domain.Instrument;
import com.trade.domain.InstrumentRepository;
import com.trade.dto.InstrumentQuoteDto;
import com.trade.dto.PriceHistoryResponseDto;
import com.trade.dto.PricePointDto;
import com.trade.exception.DomainException;
import com.trade.exception.InstrumentNotFoundException;
import com.trade.exception.InvalidParameterException;
import com.trade.mapper.MarketHistoryMapper;
import com.trade.mapper.PriceBarRow;
import com.trade.mapper.PriceRangeRow;
import com.trade.service.portfolio.LatestQuotes;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;

// The instrument page (LEAP-016). Every figure comes from what the platform
// already holds - the latest market-data quote (pricing_generator's ticks),
// its minute bars and Fauxnance's daily candles - so the browser never
// calls Fauxnance and no request here spends quota.
@Service
@Transactional(readOnly = true)
public class MarketDataService {

    // The chart ranges and how far back each reaches. 1D uses minute bars;
    // the rest use daily candles.
    private static final Map<String, Duration> MINUTE_RANGES = Map.of("1D", Duration.ofDays(1));
    private static final Map<String, Integer> DAILY_RANGE_DAYS = Map.of("1W", 7, "1M", 31, "6M", 183, "1Y", 366);

    private final InstrumentRepository instrumentRepository;
    private final MarketHistoryMapper historyMapper;
    private final LatestQuotes latestQuotes;
    private final Duration staleAfter;
    private final Clock clock;

    @Autowired
    public MarketDataService(InstrumentRepository instrumentRepository, MarketHistoryMapper historyMapper,
                             LatestQuotes latestQuotes,
                             @Value("${portfolio.quotes.stale-after-seconds:300}") long staleAfterSeconds) {
        this(instrumentRepository, historyMapper, latestQuotes, Duration.ofSeconds(staleAfterSeconds),
                Clock.systemUTC());
    }

    MarketDataService(InstrumentRepository instrumentRepository, MarketHistoryMapper historyMapper,
                      LatestQuotes latestQuotes, Duration staleAfter, Clock clock) {
        this.instrumentRepository = instrumentRepository;
        this.historyMapper = historyMapper;
        this.latestQuotes = latestQuotes;
        this.staleAfter = staleAfter;
        this.clock = clock;
    }

    // A delisted instrument is refused like an unknown one, as at placement.
    public Instrument getTradableInstrument(String symbol) throws InstrumentNotFoundException {
        return instrumentRepository.findBySymbol(symbol)
                .filter(Instrument::isTradable)
                .orElseThrow(() -> new InstrumentNotFoundException(symbol));
    }

    public InstrumentQuoteDto getQuote(String symbol) throws DomainException {
        Instrument instrument = getTradableInstrument(symbol);
        OffsetDateTime now = now();
        LocalDate today = now.toLocalDate();

        // The live quote, else the close of the latest minute bar.
        LatestQuotes.Quote quote = latestQuotes.find(symbol)
                .or(() -> historyMapper.findLatestMinuteBar(symbol)
                        .map(bar -> new LatestQuotes.Quote(bar.close(), bar.time())))
                .orElse(null);
        boolean stale = quote == null || quote.asOf().isBefore(now.minus(staleAfter));

        // Today's range from today's minute bars, else from today's candle.
        PriceRangeRow dayRange = Optional.ofNullable(historyMapper.findMinuteRange(symbol, today.atStartOfDay().atOffset(ZoneOffset.UTC)))
                .filter(range -> range.low() != null)
                .or(() -> Optional.ofNullable(historyMapper.findDailyRange(symbol, today)))
                .orElse(new PriceRangeRow(null, null));
        PriceRangeRow yearRange = Optional.ofNullable(historyMapper.findDailyRange(symbol, today.minusDays(365)))
                .orElse(new PriceRangeRow(null, null));
        BigDecimal previousClose = historyMapper.findCloseBefore(symbol, today).orElse(null);

        return new InstrumentQuoteDto(
                instrument.getSymbol(),
                instrument.getQuoteCurrency(),
                quote == null ? null : quote.bid(),
                quote == null ? null : quote.ask(),
                quote == null ? null : quote.price(),
                quote == null ? null : quote.asOf(),
                stale,
                dayRange.low(),
                dayRange.high(),
                previousClose,
                yearRange.low(),
                yearRange.high());
    }

    public PriceHistoryResponseDto getHistory(String symbol, String range) throws DomainException {
        if (!MINUTE_RANGES.containsKey(range) && !DAILY_RANGE_DAYS.containsKey(range)) {
            throw new InvalidParameterException("range");
        }
        getTradableInstrument(symbol);
        OffsetDateTime now = now();

        List<PriceBarRow> bars;
        String interval;
        if (MINUTE_RANGES.containsKey(range)) {
            bars = historyMapper.findMinuteBars(symbol, now.minus(MINUTE_RANGES.get(range)));
            interval = "1m";
        } else {
            bars = historyMapper.findDailyCandles(symbol, now.toLocalDate().minusDays(DAILY_RANGE_DAYS.get(range)));
            interval = "1d";
        }
        List<PricePointDto> points = bars.stream()
                .map(bar -> new PricePointDto(bar.time(), bar.open(), bar.high(), bar.low(), bar.close(), bar.volume()))
                .toList();
        return new PriceHistoryResponseDto(symbol, range, interval, points);
    }

    private OffsetDateTime now() {
        return OffsetDateTime.now(clock).withOffsetSameInstant(ZoneOffset.UTC);
    }
}
