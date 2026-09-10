package com.trade.domain;

import java.util.Optional;

// rule 7

public interface PositionRepository {

    Optional<Position> find(Long accountId, String symbol);
}
