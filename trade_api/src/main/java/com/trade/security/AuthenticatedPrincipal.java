package com.trade.security;

import java.util.List;

// What a verified token proves, and nothing more: who the caller is (sub),
// which trading account they were issued for (accountId), and what
// authorisation level they hold (roles). Whether that account is the one a
// given request addresses is answered by the service layer, not here.
//
// strategyId is set only on a delegated strategy token (see
// StrategyTokenIssuer): it means "this request is an automated strategy acting
// for the customer", and JwtAuthFilter then limits what it may do.
public record AuthenticatedPrincipal(String subjectUserId, Long accountId, List<String> roles, String strategyId) {

    public AuthenticatedPrincipal(String subjectUserId, Long accountId, List<String> roles) {
        this(subjectUserId, accountId, roles, null);
    }
}
