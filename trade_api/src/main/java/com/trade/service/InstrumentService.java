package com.trade.service;

import com.trade.domain.Instrument;
import com.trade.domain.InstrumentRepository;
import com.trade.dto.InstrumentResponseDto;
import com.trade.dto.PaginatedInstrumentsResponseDto;
import com.trade.exception.InvalidParameterException;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class InstrumentService {

    private final InstrumentRepository instrumentRepository;

    public InstrumentService(InstrumentRepository instrumentRepository) {
        this.instrumentRepository = instrumentRepository;
    }

    static final int MAX_PAGE_SIZE = 1000;

    public PaginatedInstrumentsResponseDto getInstruments(int pageSize, long offset) throws InvalidParameterException {
        if (pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
            throw new InvalidParameterException("pageSize");
        }
        if (offset < 0) {
            throw new InvalidParameterException("offset");
        }
        List<Instrument> instruments = instrumentRepository.findAllTradable(pageSize, offset);
        long totalCount = instrumentRepository.countTradable();

        List<InstrumentResponseDto> dtos = instruments.stream()
                .map(InstrumentService::toDto)
                .toList();

        return new PaginatedInstrumentsResponseDto(dtos, totalCount, pageSize, offset);
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
}
