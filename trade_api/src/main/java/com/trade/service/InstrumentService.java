package com.trade.service;

import com.trade.domain.Instrument;
import com.trade.domain.InstrumentRepository;
import com.trade.dto.InstrumentResponseDto;
import com.trade.dto.PaginatedInstrumentsResponseDto;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class InstrumentService {

    private final InstrumentRepository instrumentRepository;

    public InstrumentService(InstrumentRepository instrumentRepository) {
        this.instrumentRepository = instrumentRepository;
    }

    public PaginatedInstrumentsResponseDto getInstruments(int pageSize, long offset) {
        List<Instrument> instruments = instrumentRepository.findAllTradable(pageSize, offset);
        long totalCount = instrumentRepository.countTradable();

        List<InstrumentResponseDto> dtos = instruments.stream()
                .map(this::toDtoDto)
                .toList();

        return new PaginatedInstrumentsResponseDto(dtos, totalCount, pageSize, offset);
    }

    private InstrumentResponseDto toDtoDto(Instrument instrument) {
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
