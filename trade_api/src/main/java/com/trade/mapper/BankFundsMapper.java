package com.trade.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.math.BigDecimal;
import java.util.UUID;

@Mapper
public interface BankFundsMapper {
    BankFundsRow findByAccountId(@Param("accountId") long accountId);

    /** Locks both legs in one consistent query before a value transfer. */
    BankFundsRow findAndLockByAccountId(@Param("accountId") long accountId);

    int debitBank(@Param("bankAccountNumber") String bankAccountNumber, @Param("amount") BigDecimal amount);

    int creditBank(@Param("bankAccountNumber") String bankAccountNumber, @Param("amount") BigDecimal amount);

    int insertTransaction(@Param("accountUuid") UUID accountUuid,
                          @Param("type") String type,
                          @Param("amount") BigDecimal amount,
                          @Param("idempotencyKey") UUID idempotencyKey);
}
