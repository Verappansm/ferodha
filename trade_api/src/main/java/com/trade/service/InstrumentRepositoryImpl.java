package com.trade.service;

import com.trade.domain.Instrument;
import com.trade.domain.InstrumentRepository;
import com.trade.enums.InstrumentType;
import com.trade.mapper.InstrumentMapper;
import com.trade.mapper.InstrumentRow;
import org.springframework.stereotype.Component;

import java.util.Optional;

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

    private static Instrument toDomain(InstrumentRow row) {
        Instrument instrument = new Instrument(
                row.symbol(),
                row.displayName(),
                InstrumentType.valueOf(row.assetClass()),
                row.quoteCurrency()
        );
        if (!row.tradable()) {
            instrument.delist();
        }
        return instrument;
    }
}
