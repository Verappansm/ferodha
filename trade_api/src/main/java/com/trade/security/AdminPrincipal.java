package com.trade.security;

import java.util.List;
import java.util.UUID;

// What a verified admin token proves: which operator is calling (sub) and that
// they hold the ADMIN role for the operations console. It names no trading
// account, because an operator does not trade (contracts/admin-auth-api.yaml).
public record AdminPrincipal(UUID userId, List<String> roles) {
}
