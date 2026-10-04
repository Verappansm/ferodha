package com.trade.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

@Mapper
public interface PositionMapper {

    Optional<PositionRow> find(@Param("accountId") long accountId, @Param("symbol") String symbol);

    List<PositionRow> findAllForAccount(@Param("accountId") long accountId);

    /**
     * Get total unrealised P&L for an account from Positions_View.
     * Returns the sum of all unrealized_pnl_value for all positions.
     */
    BigDecimal getTotalUnrealisedPnL(@Param("accountId") long accountId);

    /**
     * Get all priced positions for an account from Positions_View.
     * Includes market values and unrealised P&L already calculated from latest market data.
     */
    List<PricedPositionRow> findPricedPositionsFromView(@Param("accountId") long accountId);

    /**
     * Get priced position for a specific symbol from Positions_View.
     */
    Optional<PricedPositionWithSymbolRow> findPricedPositionBySymbolFromView(
            @Param("accountId") long accountId,
            @Param("symbol") String symbol
    );

    /**
     * Position with pricing information from Positions_View.
     */
    record PricedPositionRow(
            long quantity,
            BigDecimal averagePrice,
            BigDecimal marketValue,
            BigDecimal unrealisedPnlValue
    ) {}

    /**
     * Position with pricing and symbol information.
     */
    record PricedPositionWithSymbolRow(
            String symbol,
            long quantity,
            BigDecimal averagePrice,
            BigDecimal marketValue,
            BigDecimal unrealisedPnlValue
    ) {}
}
