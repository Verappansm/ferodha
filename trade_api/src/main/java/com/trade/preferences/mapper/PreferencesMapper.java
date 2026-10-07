package com.trade.preferences.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Optional;

@Mapper
public interface PreferencesMapper {

    Optional<PreferenceRow> findByAccountId(@Param("accountId") long accountId);

    // Inserts the row on the first change; afterwards overwrites only the
    // settings that are non-null in the row given.
    void upsert(PreferenceRow row);

    void deleteByAccountId(@Param("accountId") long accountId);

    // Read from Users, which owns it; never copied into this module's table.
    Optional<String> findContactEmail(@Param("accountId") long accountId);
}
