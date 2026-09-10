package com.trade.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.math.BigDecimal;
import java.util.Optional;

// Statements are parameterised in mapper/AccountMapper.xml - nothing arriving
// here is ever concatenated into SQL text.
@Mapper
public interface AccountMapper {

    Optional<AccountRow> findById(@Param("id") long id);

    // The optimistic-locking write: names the version the row held when it
    // was read and increments it in the same statement. Returns the affected
    // row count rather than void, because that count is the only evidence of
    // whether the write actually happened - a second writer racing this one
    // affects zero rows here, and the caller must treat that as a refusal
    // (ORD-409), not as success.
    int updateBalanceWithVersion(@Param("id") long id,
                                  @Param("newBalance") BigDecimal newBalance,
                                  @Param("expectedVersion") int expectedVersion);
}
