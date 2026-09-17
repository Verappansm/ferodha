package com.trade.controller;

import com.trade.dto.AccountResponseDto;
import com.trade.dto.BalanceResponseDto;
import com.trade.dto.OrderHistoryEntryDto;
import com.trade.dto.PositionResponseDto;
import com.trade.enums.OrderStatus;
import com.trade.exception.DomainException;
import com.trade.security.AuthenticatedPrincipal;
import com.trade.security.JwtAuthFilter;
import com.trade.service.AccountService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.List;

//account read operations (4) from contracts trade-api yaml
//only handles the REST end points 
@RestController
@RequestMapping("/api/v1/accounts")
public class AccountController {

    private final AccountService accountService;

    public AccountController(AccountService accountService) {
        this.accountService = accountService;
    }

    @GetMapping("/{id}")
    public AccountResponseDto getAccount(@PathVariable long id,
                                          @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        return accountService.getAccount(id, principal.accountId());
    }

    @GetMapping("/{id}/balance")
    public BalanceResponseDto getBalance(@PathVariable long id,
                                          @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        return accountService.getBalance(id, principal.accountId());
    }

    @GetMapping("/{id}/positions")
    public List<PositionResponseDto> getPositions(@PathVariable long id,
                                                    @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        return accountService.getPositions(id, principal.accountId());
    }

    @GetMapping("/{id}/orders")
    public List<OrderHistoryEntryDto> getOrderHistory(
            @PathVariable long id,
            @RequestParam(required = false) OrderStatus status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to,
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        return accountService.getOrderHistory(id, principal.accountId(), status, from, to);
    }
}
