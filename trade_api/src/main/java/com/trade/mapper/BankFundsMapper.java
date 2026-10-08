package com.trade.mapper;

import com.trade.dto.BankTransactionDto;
import java.util.List;
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

    /** Open (NEW or PARTIALLY_FILLED) buy orders of the account, for the cash they hold back. */
    List<OpenBuyReservationRow> openBuyReservations(@Param("accountUuid") UUID accountUuid);

    List<BankTransactionDto> findTransactions(@Param("accountId") long accountId,
                                              @Param("limit") int limit, @Param("offset") int offset);

    long countTransactions(@Param("accountId") long accountId);
}
