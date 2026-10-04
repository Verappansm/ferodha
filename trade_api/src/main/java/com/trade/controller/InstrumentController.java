package com.trade.controller;

import com.trade.dto.InstrumentQuoteDto;
import com.trade.dto.InstrumentResponseDto;
import com.trade.dto.PaginatedInstrumentsResponseDto;
import com.trade.dto.PriceHistoryResponseDto;
import com.trade.exception.DomainException;
import com.trade.security.AuthenticatedPrincipal;
import com.trade.security.JwtAuthFilter;
import com.trade.service.InstrumentService;
import com.trade.service.MarketDataService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// The market list (LEAP-015) and the instrument page (LEAP-016). Every route
// needs a customer token; a delisted instrument is never returned.
@RestController
@RequestMapping("/api/v1/instruments")
public class InstrumentController {

    private final InstrumentService instrumentService;
    private final MarketDataService marketDataService;

    public InstrumentController(InstrumentService instrumentService, MarketDataService marketDataService) {
        this.instrumentService = instrumentService;
        this.marketDataService = marketDataService;
    }

    @GetMapping
    public PaginatedInstrumentsResponseDto getInstruments(
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(defaultValue = "0") long offset,
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        return instrumentService.getInstruments(pageSize, offset);
    }

    @GetMapping("/{symbol}")
    public InstrumentResponseDto getInstrument(
            @PathVariable String symbol,
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        return InstrumentService.toDto(marketDataService.getTradableInstrument(symbol));
    }

    @GetMapping("/{symbol}/quote")
    public InstrumentQuoteDto getQuote(
            @PathVariable String symbol,
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        return marketDataService.getQuote(symbol);
    }

    @GetMapping("/{symbol}/history")
    public PriceHistoryResponseDto getHistory(
            @PathVariable String symbol,
            @RequestParam(defaultValue = "1M") String range,
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        return marketDataService.getHistory(symbol, range);
    }
}
