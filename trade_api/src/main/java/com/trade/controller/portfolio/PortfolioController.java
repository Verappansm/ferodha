package com.trade.controller.portfolio;

import com.trade.dto.portfolio.PnlResponseDto;
import com.trade.dto.portfolio.PortfolioSummaryDto;
import com.trade.dto.portfolio.PricedPositionDto;
import com.trade.exception.DomainException;
import com.trade.security.AuthenticatedPrincipal;
import com.trade.security.JwtAuthFilter;
import com.trade.service.portfolio.PortfolioService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Portfolio and P&L REST endpoints.
 * Contract: portfolio-api.yaml
 * All routes require bearer token authentication and ownership validation.
 */
@RestController
@RequestMapping("/api/v1/portfolio")
public class PortfolioController {

    private final PortfolioService portfolioService;

    public PortfolioController(PortfolioService portfolioService) {
        this.portfolioService = portfolioService;
    }

    /**
     * GET /api/v1/portfolio/{accountId}
     * Portfolio summary: cash, totals, P&L.
     */
    @GetMapping("/{accountId}")
    public ResponseEntity<PortfolioSummaryDto> getPortfolioSummary(
            @PathVariable long accountId,
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        PortfolioSummaryDto summary = portfolioService.getPortfolioSummary(accountId, principal.accountId());
        return ResponseEntity.ok(summary);
    }

    /**
     * GET /api/v1/portfolio/{accountId}/positions
     * Priced positions with market value and unrealised P&L.
     * Optional query param: symbol (filter to single symbol).
     */
    @GetMapping("/{accountId}/positions")
    public ResponseEntity<List<PricedPositionDto>> getPricedPositions(
            @PathVariable long accountId,
            @RequestParam(required = false) String symbol,
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        List<PricedPositionDto> positions = portfolioService.getPricedPositions(accountId, principal.accountId(), symbol);
        return ResponseEntity.ok(positions);
    }

    /**
     * GET /api/v1/portfolio/{accountId}/pnl
     * Profit and loss: realised, unrealised, total.
     */
    @GetMapping("/{accountId}/pnl")
    public ResponseEntity<PnlResponseDto> getPnL(
            @PathVariable long accountId,
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        PnlResponseDto pnl = portfolioService.getPnL(accountId, principal.accountId());
        return ResponseEntity.ok(pnl);
    }
}
