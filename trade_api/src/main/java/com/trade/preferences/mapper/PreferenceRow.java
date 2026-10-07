package com.trade.preferences.mapper;

// One stored row of pref_customer_preference. Every setting is nullable:
// null means the customer never changed it, and the default applies.
public record PreferenceRow(
        Long accountId,
        Long defaultAccountId,
        String notificationChannel,
        Boolean notifyOrderFilled,
        Boolean notifyOrderRejected,
        Boolean notifyOrderCancelled,
        Boolean notifyPriceAlerts,
        String theme,
        String numberFormat,
        Boolean compactTables,
        Boolean hideBalances,
        String startPage) {
}
