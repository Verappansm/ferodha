package com.trade.service.portfolio;

import com.trade.dto.portfolio.PnlResponseDto;
import com.trade.dto.portfolio.PortfolioSummaryDto;
import com.trade.dto.portfolio.PricedPositionDto;
import com.trade.exception.AccountNotFoundException;
import com.trade.exception.DomainException;
import com.trade.exception.InvalidAccountAccessException;
import com.trade.exception.PricingUnavailableException;
import com.trade.mapper.AccountMapper;
import com.trade.mapper.AccountRow;
import com.trade.mapper.PositionMapper;
import com.trade.mapper.PositionRow;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.*;

/**
 * Portfolio and P&L service.
 * Reads holdings from Positions_View which uses latest Market_Data prices to calculate P&L.
 * No external API calls - all data sourced from database views.
 */
@Service
@Transactional(readOnly = true)
public class PortfolioService {

    private final AccountMapper accountMapper;
    private final PositionMapper positionMapper;

    public PortfolioService(AccountMapper accountMapper, PositionMapper positionMapper) {
        this.accountMapper = accountMapper;
        this.positionMapper = positionMapper;
    }

    /**
     * Get portfolio summary: cash, totals, P&L.
     * Reads from Positions_View which uses latest Market_Data prices.
     */
    public PortfolioSummaryDto getPortfolioSummary(long accountId, Long callerAccountId) throws DomainException {
        AccountRow account = loadAndValidateAccount(accountId, callerAccountId);
        List<PositionMapper.PricedPositionRow> positions = positionMapper.findPricedPositionsFromView(accountId);

        if (positions.isEmpty()) {
            // Empty portfolio
            return new PortfolioSummaryDto(
                    accountId,
                    account.currency(),
                    account.cashBalance(),
                    BigDecimal.ZERO,
                    BigDecimal.ZERO,
                    BigDecimal.ZERO,
                    BigDecimal.ZERO,
                    account.cashBalance(),
                    0,
                    false,
                    Instant.now(),
                    Instant.now()
            );
        }

        // Calculate portfolio metrics from Positions_View (which already has market prices)
        BigDecimal totalMarketValue = BigDecimal.ZERO;
        BigDecimal totalCostBasis = BigDecimal.ZERO;
        BigDecimal totalUnrealisedPnL = BigDecimal.ZERO;

        for (PositionMapper.PricedPositionRow position : positions) {
            totalMarketValue = totalMarketValue.add(position.marketValue());
            totalCostBasis = totalCostBasis.add(
                    position.averagePrice().multiply(BigDecimal.valueOf(position.quantity()))
            );
            totalUnrealisedPnL = totalUnrealisedPnL.add(position.unrealisedPnlValue());
        }

        BigDecimal realisedPnL = BigDecimal.ZERO; // TODO: fetch from RealisedPnL table once migrated
        BigDecimal totalValue = account.cashBalance().add(totalMarketValue);

        return new PortfolioSummaryDto(
                accountId,
                account.currency(),
                account.cashBalance(),
                totalMarketValue,
                totalCostBasis,
                totalUnrealisedPnL,
                realisedPnL,
                totalValue,
                positions.size(),
                false, // Not partial since we're using database prices (always available)
                Instant.now(), // Database prices don't have a specific fetch time, use now
                Instant.now()
        );
    }

    /**
     * Get priced positions.
     * Reads from Positions_View which uses latest Market_Data prices.
     */
    public List<PricedPositionDto> getPricedPositions(long accountId, Long callerAccountId, String symbolFilter)
            throws DomainException {
        AccountRow account = loadAndValidateAccount(accountId, callerAccountId);

        // Get position from view, optionally filtered by symbol
        List<PositionMapper.PricedPositionWithSymbolRow> positions;
        if (symbolFilter != null && !symbolFilter.isEmpty()) {
            var position = positionMapper.findPricedPositionBySymbolFromView(accountId, symbolFilter);
            positions = position.map(List::of).orElse(Collections.emptyList());
        } else {
            // Need to join with Instruments to get symbols for all positions
            // For now, use the old method but with database-calculated values
            List<PositionRow> oldPositions = positionMapper.findAllForAccount(accountId);
            positions = new ArrayList<>();

            for (PositionRow pos : oldPositions) {
                var pricedPos = positionMapper.findPricedPositionBySymbolFromView(accountId, pos.symbol());
                pricedPos.ifPresent(positions::add);
            }
        }

        if (positions.isEmpty()) {
            return Collections.emptyList();
        }

        // Build DTOs from Positions_View data
        List<PricedPositionDto> result = new ArrayList<>();
        for (PositionMapper.PricedPositionWithSymbolRow position : positions) {
            BigDecimal costBasis = position.averagePrice().multiply(BigDecimal.valueOf(position.quantity()));

            result.add(new PricedPositionDto(
                    accountId,
                    position.symbol(),
                    BigDecimal.valueOf(position.quantity()),
                    position.averagePrice(),
                    costBasis,
                    account.currency(),
                    position.marketValue().divide(BigDecimal.valueOf(Math.max(position.quantity(), 1)), 4, java.math.RoundingMode.HALF_UP), // current price
                    position.marketValue(),
                    position.unrealisedPnlValue(),
                    false, // Database prices are never stale
                    Instant.now()
            ));
        }

        return result;
    }

    /**
     * Get P&L summary.
     * Reads from Positions_View which already calculates unrealised P&L using latest Market_Data prices.
     */
    public PnlResponseDto getPnL(long accountId, Long callerAccountId) throws DomainException {
        loadAndValidateAccount(accountId, callerAccountId);

        // Get total unrealised P&L from Positions_View (which uses latest market prices from Market_Data)
        BigDecimal totalUnrealisedPnL = positionMapper.getTotalUnrealisedPnL(accountId);
        if (totalUnrealisedPnL == null) {
            totalUnrealisedPnL = BigDecimal.ZERO;
        }

        BigDecimal realisedPnL = BigDecimal.ZERO; // TODO: fetch from RealisedPnL table
        BigDecimal totalPnL = realisedPnL.add(totalUnrealisedPnL);

        return new PnlResponseDto(
                accountId,
                "USD", // TODO: fetch from account
                realisedPnL,
                totalUnrealisedPnL,
                totalPnL,
                Instant.now()
        );
    }

    private AccountRow loadAndValidateAccount(long accountId, Long callerAccountId) throws DomainException {
        AccountRow account = accountMapper.findById(accountId)
                .orElseThrow(() -> new AccountNotFoundException(accountId));

        // Validate ownership
        if (!account.id().equals(callerAccountId)) {
            throw new InvalidAccountAccessException(accountId, callerAccountId);
        }

        return account;
    }
}
