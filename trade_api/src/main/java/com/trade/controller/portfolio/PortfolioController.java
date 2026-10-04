package com.trade.controller.portfolio;

import com.trade.dto.portfolio.PnlResponseDto;
import com.trade.dto.portfolio.PortfolioSummaryDto;
import com.trade.dto.portfolio.PricedPositionDto;
import com.trade.exception.DomainException;
import com.trade.security.AuthenticatedPrincipal;
import com.trade.security.JwtAuthFilter;
import com.trade.service.portfolio.PortfolioService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

// The three routes of contracts/portfolio-api.yaml (design/portfolio-api.yaml),
// served by trade_api as a module beside the order and account routes.
@RestController
@RequestMapping("/api/v1/portfolio/{accountId}")
public class PortfolioController {

    private final PortfolioService portfolioService;

    public PortfolioController(PortfolioService portfolioService) {
        this.portfolioService = portfolioService;
    }

    @GetMapping
    public PortfolioSummaryDto getPortfolioSummary(
            @PathVariable long accountId,
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        return portfolioService.getPortfolioSummary(accountId, principal.accountId());
    }

    @GetMapping("/positions")
    public List<PricedPositionDto> getPricedPositions(
            @PathVariable long accountId,
            @RequestParam(required = false) String symbol,
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        return portfolioService.getPricedPositions(accountId, principal.accountId(), symbol);
    }

    @GetMapping("/pnl")
    public PnlResponseDto getPnl(
            @PathVariable long accountId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "false") boolean bySymbol,
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        return portfolioService.getPnl(accountId, principal.accountId(), from, to, bySymbol);
    }
}
