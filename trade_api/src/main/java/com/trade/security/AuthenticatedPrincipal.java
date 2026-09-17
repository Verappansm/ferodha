package com.trade.security;

import java.util.List;

// What a verified token proves, and nothing more: who the caller is (sub),
// which trading account they were issued for (accountId), and what
// authorisation level they hold (roles). Whether that account is the one a
// given request addresses is answered by the service layer, not here.
public record AuthenticatedPrincipal(String subjectUserId, Long accountId, List<String> roles) {
}
