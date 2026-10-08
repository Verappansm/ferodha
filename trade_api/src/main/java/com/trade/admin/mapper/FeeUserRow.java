package com.trade.admin.mapper;

import java.math.BigDecimal;

// Commission one customer account has paid, in the account's own currency.
public record FeeUserRow(String userId, String name, String email, Long accountId, String currency,
                         Long orders, BigDecimal fees) {
}
