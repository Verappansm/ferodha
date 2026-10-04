package com.trade.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Collection;
import java.util.List;

// The two reads behind contracts/portfolio-api.yaml. Every figure the
// portfolio routes return is derived in PortfolioService from these rows.
@Mapper
public interface PortfolioMapper {

    // Every fill on the account, oldest first - the order the running
    // average cost and the realised P&L have to be replayed in.
    List<FillRow> findFills(@Param("accountId") long accountId);

    // The newest stored price per symbol (latest minute bar, else latest
    // daily candle). Only a fallback for a symbol the market-data topic has
    // not quoted since this process started.
    List<StoredPriceRow> findLatestStoredPrices(@Param("symbols") Collection<String> symbols);
}
