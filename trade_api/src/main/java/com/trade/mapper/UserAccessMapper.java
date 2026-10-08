package com.trade.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

// The per-request check behind JwtAuthFilter: a token is only signed text, so
// suspending a user or forcing a password reset cannot cancel one already
// issued. Asking Users on every request closes that window to zero instead of
// the access token's 15 minutes. An unknown user id is blocked too.
@Mapper
public interface UserAccessMapper {

    // A customer token: the user must be ACTIVE with no forced reset pending.
    boolean isCustomerBlocked(@Param("userId") String userId);

    // An admin console token: the operator must be an ACTIVE admin. A forced
    // reset is not checked here, because admin sign-in does not enforce one.
    boolean isAdminBlocked(@Param("userId") String userId);

    // A delegated strategy token is honoured only while its strategy still
    // belongs to the token's user and is ENABLED: disabling a strategy stops
    // its very next order, whatever the token's remaining lifetime.
    boolean isStrategyTokenValid(@Param("strategyId") String strategyId, @Param("userId") String userId);
}
