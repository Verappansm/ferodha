package com.trade.strategy;

import com.trade.exception.DomainException;
import com.trade.security.AuthenticatedPrincipal;
import com.trade.security.JwtAuthFilter;
import com.trade.strategy.StrategyDtos.CreateStrategyRequest;
import com.trade.strategy.StrategyDtos.StrategyEventResponse;
import com.trade.strategy.StrategyDtos.StrategyResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

// /api/v1/strategies. Every route reads the caller from the verified token and
// the service checks the strategy belongs to that account. A delegated
// strategy token never reaches here: JwtAuthFilter lets it place orders only.
@RestController
@RequestMapping("/api/v1/strategies")
public class StrategyController {

    private final StrategyService service;

    public StrategyController(StrategyService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public StrategyResponse create(@Valid @RequestBody CreateStrategyRequest request,
                                   @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        return service.create(request, principal.subjectUserId(), principal.accountId());
    }

    @GetMapping
    public List<StrategyResponse> list(
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        return service.list(principal.accountId());
    }

    @GetMapping("/{id}")
    public StrategyResponse get(@PathVariable String id,
                                @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        return service.get(id, principal.accountId());
    }

    @GetMapping("/{id}/events")
    public List<StrategyEventResponse> events(@PathVariable String id,
                                              @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        return service.events(id, principal.accountId());
    }

    @PostMapping("/{id}/enable")
    public StrategyResponse enable(@PathVariable String id,
                                   @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        return service.enable(id, principal.accountId());
    }

    @PostMapping("/{id}/disable")
    public StrategyResponse disable(@PathVariable String id,
                                    @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws DomainException {
        return service.disable(id, principal.accountId());
    }
}
