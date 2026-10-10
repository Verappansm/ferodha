package com.trade.preferences;

import java.util.List;

// The shapes of contracts/preferences-api.yaml, plus the internal ChannelRoute
// the notifications module receives. Enum names are the wire values.
public final class PreferenceDtos {

    private PreferenceDtos() {
    }

    public enum NotificationChannel { IN_APP, EMAIL }

    public enum Theme { LIGHT, DARK }

    public enum NumberFormat { INDIAN, INTERNATIONAL }

    public enum StartPage { DASHBOARD, PORTFOLIO, WATCHLIST, ORDERS }

    // What the notifications module is about to tell the customer.
    public enum AlertType { ORDER_FILLED, ORDER_REJECTED, ORDER_CANCELLED, PRICE_ALERT }

    public record NotifyOn(boolean orderFilled, boolean orderRejected, boolean orderCancelled, boolean priceAlerts) {
    }

    // Boxed, so a flag left out of the request reads as "unchanged".
    public record NotifyOnUpdate(Boolean orderFilled, Boolean orderRejected, Boolean orderCancelled, Boolean priceAlerts) {
    }

    public record PreferencesResponse(
            long accountId,
            long defaultAccountId,
            NotificationChannel notificationChannel,
            String contactDetail,
            NotifyOn notifyOn,
            Theme theme,
            NumberFormat numberFormat,
            boolean compactTables,
            boolean hideBalances,
            StartPage startPage,
            List<String> customised) {
    }

    // Every field optional: null leaves the setting as it is.
    public record PreferencesUpdateRequest(
            NotificationChannel notificationChannel,
            NotifyOnUpdate notifyOn,
            Theme theme,
            NumberFormat numberFormat,
            Boolean compactTables,
            Boolean hideBalances,
            StartPage startPage) {
    }

    // The routing decision for one alert. deliver=false means the customer
    // turned that alert type off. destination is the real address for
    // EMAIL (never sent to a browser) and null for IN_APP.
    public record ChannelRoute(boolean deliver, NotificationChannel channel, String destination, Source source) {

        public enum Source { STORED, DEFAULT, NO_CONTACT, FALLBACK }
    }
}
