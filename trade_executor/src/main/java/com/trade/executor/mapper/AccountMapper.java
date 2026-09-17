package com.trade.executor.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.math.BigDecimal;
import java.util.Optional;

@Mapper
public interface AccountMapper {

    Optional<AccountRow> findById(@Param("id") Long id);

    // Guard 2: optimistic lock on Accounts.version. Zero rows affected
    // means another write reached this account between our read and this
    // update; the caller re-reads and retries up to a bounded budget.
    int updateBalanceWithVersion(@Param("id") Long id,
                                  @Param("newBalance") BigDecimal newBalance,
                                  @Param("expectedVersion") Integer expectedVersion);
}
