package com.trade.service;

import com.trade.domain.Instrument;
import com.trade.domain.InstrumentRepository;
import com.trade.enums.InstrumentType;
import com.trade.mapper.InstrumentMapper;
import com.trade.mapper.InstrumentRow;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
public class InstrumentRepositoryImpl implements InstrumentRepository {

    private final InstrumentMapper instrumentMapper;

    public InstrumentRepositoryImpl(InstrumentMapper instrumentMapper) {
        this.instrumentMapper = instrumentMapper;
    }

    @Override
    public Optional<Instrument> findBySymbol(String symbol) {
        return instrumentMapper.findBySymbol(symbol).map(InstrumentRepositoryImpl::toDomain);
    }

    @Override
    public Optional<Instrument> findByInstrumentId(UUID instrumentId) {
        return instrumentMapper.findByInstrumentId(instrumentId).map(InstrumentRepositoryImpl::toDomain);
    }

    @Override
    public Map<UUID, Instrument> findByInstrumentIds(Collection<UUID> instrumentIds) {
        if (instrumentIds.isEmpty()) {
            return Map.of();
        }
        return instrumentMapper.findByInstrumentIds(instrumentIds).stream()
                .map(InstrumentRepositoryImpl::toDomain)
                .collect(Collectors.toMap(Instrument::getInstrumentId, Function.identity()));
    }

    @Override
    public List<Instrument> findAllTradable(int limit, long offset) {
        return instrumentMapper.findAllTradable(limit, (int) offset)
                .stream()
                .map(InstrumentRepositoryImpl::toDomain)
                .toList();
    }

    @Override
    public long countTradable() {
        return instrumentMapper.countTradable();
    }

    private static Instrument toDomain(InstrumentRow row) {
        Instrument instrument = new Instrument(
                row.instrumentId(),
                row.symbol(),
                row.displayName(),
                InstrumentType.valueOf(row.assetClass()),
                row.quoteCurrency(),
                row.exchange(),
                row.sector()
        );
        if (!row.tradable()) {
            instrument.delist();
        }
        return instrument;
    }
}
