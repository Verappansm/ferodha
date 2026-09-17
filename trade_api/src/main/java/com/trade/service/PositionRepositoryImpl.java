package com.trade.service;

import com.trade.domain.Position;
import com.trade.domain.PositionRepository;
import com.trade.mapper.PositionMapper;
import org.springframework.stereotype.Component;

import java.util.Optional;

@Component
public class PositionRepositoryImpl implements PositionRepository {

    private final PositionMapper positionMapper;

    public PositionRepositoryImpl(PositionMapper positionMapper) {
        this.positionMapper = positionMapper;
    }

    @Override
    public Optional<Position> find(Long accountId, String symbol) {
        return positionMapper.find(accountId, symbol)
                .map(row -> new Position(row.accountId(), row.symbol(), row.quantity(), row.averageCost()));
    }
}
