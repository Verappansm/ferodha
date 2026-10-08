package com.trade.preferences;

import com.trade.exception.AccountNotActiveException;
import com.trade.preferences.PreferenceDtos.AlertType;
import com.trade.preferences.PreferenceDtos.ChannelRoute;
import com.trade.preferences.PreferenceDtos.PreferencesResponse;
import com.trade.preferences.PreferenceDtos.PreferencesUpdateRequest;

// The one way into customer preferences. Other modules depend on this
// interface, never on the table.
public interface PreferencesService {

    // Customer path. Each call compares the addressed account with the
    // account in the verified token and refuses a mismatch with ACC-403.

    PreferencesResponse get(long accountId, Long callerAccountId) throws AccountNotActiveException;

    PreferencesResponse update(long accountId, Long callerAccountId, PreferencesUpdateRequest request)
            throws AccountNotActiveException;

    PreferencesResponse reset(long accountId, Long callerAccountId) throws AccountNotActiveException;

    // Internal path, for the notifications module, in-process only: no
    // controller maps it, so no token of any kind can reach it over HTTP.
    // It never throws - a customer must still hear about their own trade
    // when this module is in trouble - and falls back to IN_APP instead.
    ChannelRoute resolveChannel(long accountId, AlertType alertType);
}
