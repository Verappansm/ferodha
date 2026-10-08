package com.trade.preferences;

import com.trade.exception.AccountNotActiveException;
import com.trade.preferences.PreferenceDtos.AlertType;
import com.trade.preferences.PreferenceDtos.ChannelRoute;
import com.trade.preferences.PreferenceDtos.ChannelRoute.Source;
import com.trade.preferences.PreferenceDtos.NotificationChannel;
import com.trade.preferences.PreferenceDtos.NotifyOn;
import com.trade.preferences.PreferenceDtos.NotifyOnUpdate;
import com.trade.preferences.PreferenceDtos.NumberFormat;
import com.trade.preferences.PreferenceDtos.PreferencesResponse;
import com.trade.preferences.PreferenceDtos.PreferencesUpdateRequest;
import com.trade.preferences.PreferenceDtos.StartPage;
import com.trade.preferences.PreferenceDtos.Theme;
import com.trade.preferences.mapper.PreferenceRow;
import com.trade.preferences.mapper.PreferencesMapper;
import com.trade.service.AccountAccessGuard;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;

@Service
public class DefaultPreferencesService implements PreferencesService {

    private static final Logger log = LoggerFactory.getLogger(DefaultPreferencesService.class);

    private final PreferencesMapper mapper;
    private final AccountAccessGuard accessGuard;

    // Last row read per account, so resolveChannel can still answer with
    // the customer's own choice while the database is unreachable. Absent
    // entry and stored-but-empty are told apart by Optional.
    private final Map<Long, Optional<PreferenceRow>> lastKnown = new ConcurrentHashMap<>();

    public DefaultPreferencesService(PreferencesMapper mapper, AccountAccessGuard accessGuard) {
        this.mapper = mapper;
        this.accessGuard = accessGuard;
    }

    @Override
    public PreferencesResponse get(long accountId, Long callerAccountId) throws AccountNotActiveException {
        accessGuard.requireTokenMatches(accountId, callerAccountId);
        return toResponse(accountId, load(accountId));
    }

    @Override
    @Transactional
    public PreferencesResponse update(long accountId, Long callerAccountId, PreferencesUpdateRequest request)
            throws AccountNotActiveException {
        accessGuard.requireTokenMatches(accountId, callerAccountId);
        NotifyOnUpdate notify = request.notifyOn() != null
                ? request.notifyOn() : new NotifyOnUpdate(null, null, null, null);
        // One user, one account: the default account is the account itself,
        // which the guard above has just proved the caller owns.
        mapper.upsert(new PreferenceRow(
                accountId,
                accountId,
                nameOf(request.notificationChannel()),
                notify.orderFilled(),
                notify.orderRejected(),
                notify.orderCancelled(),
                notify.priceAlerts(),
                nameOf(request.theme()),
                nameOf(request.numberFormat()),
                request.compactTables(),
                request.hideBalances(),
                nameOf(request.startPage())));
        return toResponse(accountId, load(accountId));
    }

    @Override
    @Transactional
    public PreferencesResponse reset(long accountId, Long callerAccountId) throws AccountNotActiveException {
        accessGuard.requireTokenMatches(accountId, callerAccountId);
        mapper.deleteByAccountId(accountId);
        lastKnown.put(accountId, Optional.empty());
        return toResponse(accountId, Optional.empty());
    }

    @Override
    public ChannelRoute resolveChannel(long accountId, AlertType alertType) {
        Optional<PreferenceRow> row;
        try {
            row = load(accountId);
        } catch (RuntimeException e) {
            log.warn("Preferences unavailable for accountId={}, using last known or default: {}",
                    accountId, e.toString());
            row = lastKnown.getOrDefault(accountId, Optional.empty());
            if (!wants(row, alertType)) {
                return new ChannelRoute(false, PreferenceDefaults.CHANNEL, null, Source.FALLBACK);
            }
            // EMAIL needs the address, which needs the database; IN_APP does not.
            return new ChannelRoute(true, NotificationChannel.IN_APP, null, Source.FALLBACK);
        }

        Source source = row.map(PreferenceRow::notificationChannel).isPresent() ? Source.STORED : Source.DEFAULT;
        NotificationChannel channel = channelOf(row);
        if (!wants(row, alertType)) {
            return new ChannelRoute(false, channel, null, source);
        }
        if (channel == NotificationChannel.EMAIL) {
            try {
                Optional<String> email = mapper.findContactEmail(accountId).filter(s -> !s.isBlank());
                if (email.isPresent()) {
                    return new ChannelRoute(true, NotificationChannel.EMAIL, email.get(), source);
                }
                return new ChannelRoute(true, NotificationChannel.IN_APP, null, Source.NO_CONTACT);
            } catch (RuntimeException e) {
                log.warn("Contact lookup failed for accountId={}, falling back to IN_APP: {}", accountId, e.toString());
                return new ChannelRoute(true, NotificationChannel.IN_APP, null, Source.FALLBACK);
            }
        }
        return new ChannelRoute(true, NotificationChannel.IN_APP, null, source);
    }

    private Optional<PreferenceRow> load(long accountId) {
        Optional<PreferenceRow> row = mapper.findByAccountId(accountId);
        lastKnown.put(accountId, row);
        return row;
    }

    private PreferencesResponse toResponse(long accountId, Optional<PreferenceRow> row) {
        List<String> customised = new ArrayList<>();
        NotificationChannel channel = channelOf(row);
        if (row.map(PreferenceRow::notificationChannel).isPresent()) customised.add("notificationChannel");

        NotifyOn notifyOn = new NotifyOn(
                flag(row, PreferenceRow::notifyOrderFilled, PreferenceDefaults.NOTIFY_ORDER_FILLED),
                flag(row, PreferenceRow::notifyOrderRejected, PreferenceDefaults.NOTIFY_ORDER_REJECTED),
                flag(row, PreferenceRow::notifyOrderCancelled, PreferenceDefaults.NOTIFY_ORDER_CANCELLED),
                flag(row, PreferenceRow::notifyPriceAlerts, PreferenceDefaults.NOTIFY_PRICE_ALERTS));
        if (row.isPresent() && (row.get().notifyOrderFilled() != null || row.get().notifyOrderRejected() != null
                || row.get().notifyOrderCancelled() != null || row.get().notifyPriceAlerts() != null)) {
            customised.add("notifyOn");
        }

        Theme theme = row.map(PreferenceRow::theme).map(Theme::valueOf).orElse(PreferenceDefaults.THEME);
        if (row.map(PreferenceRow::theme).isPresent()) customised.add("theme");

        NumberFormat numberFormat = row.map(PreferenceRow::numberFormat).map(NumberFormat::valueOf)
                .orElse(PreferenceDefaults.NUMBER_FORMAT);
        if (row.map(PreferenceRow::numberFormat).isPresent()) customised.add("numberFormat");

        boolean compact = flag(row, PreferenceRow::compactTables, PreferenceDefaults.COMPACT_TABLES);
        if (row.map(PreferenceRow::compactTables).isPresent()) customised.add("compactTables");

        boolean hide = flag(row, PreferenceRow::hideBalances, PreferenceDefaults.HIDE_BALANCES);
        if (row.map(PreferenceRow::hideBalances).isPresent()) customised.add("hideBalances");

        StartPage startPage = row.map(PreferenceRow::startPage).map(StartPage::valueOf)
                .orElse(PreferenceDefaults.START_PAGE);
        if (row.map(PreferenceRow::startPage).isPresent()) customised.add("startPage");

        long defaultAccountId = row.map(PreferenceRow::defaultAccountId).orElse(accountId);
        String contact = mapper.findContactEmail(accountId).map(DefaultPreferencesService::maskEmail).orElse(null);

        return new PreferencesResponse(accountId, defaultAccountId, channel, contact, notifyOn, theme,
                numberFormat, compact, hide, startPage, List.copyOf(customised));
    }

    private static NotificationChannel channelOf(Optional<PreferenceRow> row) {
        return row.map(PreferenceRow::notificationChannel).map(NotificationChannel::valueOf)
                .orElse(PreferenceDefaults.CHANNEL);
    }

    private static boolean wants(Optional<PreferenceRow> row, AlertType type) {
        return switch (type) {
            case ORDER_FILLED -> flag(row, PreferenceRow::notifyOrderFilled, PreferenceDefaults.NOTIFY_ORDER_FILLED);
            case ORDER_REJECTED -> flag(row, PreferenceRow::notifyOrderRejected, PreferenceDefaults.NOTIFY_ORDER_REJECTED);
            case ORDER_CANCELLED -> flag(row, PreferenceRow::notifyOrderCancelled, PreferenceDefaults.NOTIFY_ORDER_CANCELLED);
            case PRICE_ALERT -> flag(row, PreferenceRow::notifyPriceAlerts, PreferenceDefaults.NOTIFY_PRICE_ALERTS);
        };
    }

    private static boolean flag(Optional<PreferenceRow> row, Function<PreferenceRow, Boolean> field, boolean fallback) {
        return row.map(field).orElse(fallback);
    }

    private static String nameOf(Enum<?> value) {
        return value == null ? null : value.name();
    }

    // r****@gmail.com - enough for the customer to recognise, too little to harvest.
    static String maskEmail(String email) {
        if (email == null || email.isBlank()) {
            return null;
        }
        int at = email.indexOf('@');
        if (at <= 0) {
            return "****";
        }
        return email.charAt(0) + "****" + email.substring(at);
    }
}
