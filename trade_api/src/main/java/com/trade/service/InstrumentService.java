package com.trade.service;

import com.trade.domain.Instrument;
import com.trade.domain.InstrumentRepository;
import com.trade.enums.InstrumentType;
import com.trade.dto.InstrumentFiltersResponseDto;
import com.trade.dto.InstrumentResponseDto;
import com.trade.dto.PaginatedInstrumentsResponseDto;
import com.trade.exception.InvalidParameterException;
import com.trade.mapper.InstrumentMapper;
import com.trade.mapper.InstrumentRow;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;

@Service
public class InstrumentService {

    private final InstrumentRepository instrumentRepository;
    private final InstrumentMapper instrumentMapper;

    public InstrumentService(InstrumentRepository instrumentRepository, InstrumentMapper instrumentMapper) {
        this.instrumentRepository = instrumentRepository;
        this.instrumentMapper = instrumentMapper;
    }

    static final int MAX_PAGE_SIZE = 1000;
    static final int MAX_QUERY_LENGTH = 100;

    public PaginatedInstrumentsResponseDto getInstruments(int pageSize, long offset) throws InvalidParameterException {
        checkPage(pageSize, offset);
        List<Instrument> instruments = instrumentRepository.findAllTradable(pageSize, offset);
        long totalCount = instrumentRepository.countTradable();

        List<InstrumentResponseDto> dtos = instruments.stream()
                .map(InstrumentService::toDto)
                .toList();

        return new PaginatedInstrumentsResponseDto(dtos, totalCount, pageSize, offset);
    }

    /**
     * The market list (LEAP-015): tradable instruments matching every filter given. The text
     * matches part of the ticker or the name, case-insensitively; a blank filter is no filter.
     */
    public PaginatedInstrumentsResponseDto searchInstruments(String query, String exchange, String sector,
                                                             String type, int pageSize, long offset)
            throws InvalidParameterException {
        checkPage(pageSize, offset);
        String text = blankToNull(query);
        if (text != null && text.length() > MAX_QUERY_LENGTH) {
            throw new InvalidParameterException("search");
        }
        String typeFilter = blankToNull(type);
        if (typeFilter != null) {
            try {
                typeFilter = InstrumentType.valueOf(typeFilter.toUpperCase(Locale.ROOT)).name();
            } catch (IllegalArgumentException e) {
                throw new InvalidParameterException("type");
            }
        }
        String pattern = text == null ? null : "%" + escapeLike(text.toLowerCase(Locale.ROOT)) + "%";
        String exchangeFilter = blankToNull(exchange);
        String sectorFilter = blankToNull(sector);

        List<InstrumentResponseDto> dtos = instrumentMapper
                .searchTradable(pattern, exchangeFilter, sectorFilter, typeFilter, pageSize, offset)
                .stream()
                .map(InstrumentService::toDto)
                .toList();
        long total = instrumentMapper.countSearchTradable(pattern, exchangeFilter, sectorFilter, typeFilter);
        return new PaginatedInstrumentsResponseDto(dtos, total, pageSize, offset);
    }

    /** The filter choices, from the data rather than a constant (LEAP-015). */
    public InstrumentFiltersResponseDto filters() {
        return new InstrumentFiltersResponseDto(
                instrumentMapper.distinctTradableExchanges(),
                instrumentMapper.distinctTradableSectors(),
                instrumentMapper.distinctTradableTypes());
    }

    public static InstrumentResponseDto toDto(Instrument instrument) {
        return new InstrumentResponseDto(
                instrument.getSymbol(),
                instrument.getDisplayName(),
                instrument.getAssetClass(),
                instrument.getExchange(),
                instrument.getQuoteCurrency(),
                instrument.getSector()
        );
    }

    private static InstrumentResponseDto toDto(InstrumentRow row) {
        return new InstrumentResponseDto(
                row.symbol(),
                row.displayName(),
                InstrumentType.valueOf(row.assetClass()),
                row.exchange(),
                row.quoteCurrency(),
                row.sector());
    }

    private static void checkPage(int pageSize, long offset) throws InvalidParameterException {
        if (pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
            throw new InvalidParameterException("pageSize");
        }
        if (offset < 0) {
            throw new InvalidParameterException("offset");
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    /** A typed % or _ is matched literally, not as a wildcard ('!' is the mapper's escape). */
    static String escapeLike(String text) {
        return text.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }
}
