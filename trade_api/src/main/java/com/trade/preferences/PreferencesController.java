package com.trade.preferences;

import com.trade.exception.AccountNotActiveException;
import com.trade.preferences.PreferenceDtos.PreferencesResponse;
import com.trade.preferences.PreferenceDtos.PreferencesUpdateRequest;
import com.trade.security.AuthenticatedPrincipal;
import com.trade.security.JwtAuthFilter;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// Customer routes only, per design/preferences-api.yaml. Under /api/v1, so
// JwtAuthFilter has verified the token before any of these run; the service
// then compares the token's account with the one addressed. The internal
// resolveChannel path is deliberately not mapped here.
@RestController
@RequestMapping("/api/v1/accounts/{id}/preferences")
public class PreferencesController {

    private final PreferencesService preferencesService;

    public PreferencesController(PreferencesService preferencesService) {
        this.preferencesService = preferencesService;
    }

    @GetMapping
    public PreferencesResponse get(
            @PathVariable long id,
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws AccountNotActiveException {
        return preferencesService.get(id, principal.accountId());
    }

    @PatchMapping
    public PreferencesResponse update(
            @PathVariable long id,
            @RequestBody PreferencesUpdateRequest request,
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws AccountNotActiveException {
        return preferencesService.update(id, principal.accountId(), request);
    }

    @DeleteMapping
    public PreferencesResponse reset(
            @PathVariable long id,
            @RequestAttribute(JwtAuthFilter.PRINCIPAL_ATTRIBUTE) AuthenticatedPrincipal principal)
            throws AccountNotActiveException {
        return preferencesService.reset(id, principal.accountId());
    }
}
