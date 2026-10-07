package com.trade.preferences;

import com.trade.preferences.PreferenceDtos.NotificationChannel;
import com.trade.preferences.PreferenceDtos.NumberFormat;
import com.trade.preferences.PreferenceDtos.StartPage;
import com.trade.preferences.PreferenceDtos.Theme;

// What a customer gets for every setting they never changed. The one place
// these live: the stored row holds only differences from this.
//
// IN_APP is the default channel because it is always deliverable - it needs
// no contact detail and no outside provider.
public final class PreferenceDefaults {

    public static final NotificationChannel CHANNEL = NotificationChannel.IN_APP;
    public static final boolean NOTIFY_ORDER_FILLED = true;
    public static final boolean NOTIFY_ORDER_REJECTED = true;
    public static final boolean NOTIFY_ORDER_CANCELLED = true;
    public static final boolean NOTIFY_PRICE_ALERTS = true;
    public static final Theme THEME = Theme.LIGHT;
    public static final NumberFormat NUMBER_FORMAT = NumberFormat.INTERNATIONAL;
    public static final boolean COMPACT_TABLES = false;
    public static final boolean HIDE_BALANCES = false;
    public static final StartPage START_PAGE = StartPage.DASHBOARD;

    private PreferenceDefaults() {
    }
}
