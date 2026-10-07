package com.trade.admin.mapper;

import com.trade.admin.dto.AdminDtos.AccountRequestDto;
import com.trade.admin.dto.AdminDtos.AdminAccountDto;
import com.trade.admin.dto.AdminDtos.AdminInstrumentDto;
import com.trade.admin.dto.AdminDtos.AdminOrderDto;
import com.trade.admin.dto.AdminDtos.AdminSummaryDto;
import com.trade.admin.dto.AdminDtos.AuditEntryDto;
import java.time.LocalDate;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.OffsetDateTime;
import java.util.List;

// Every statement the admin package runs, parameterised in
// mapper/AdminMapper.xml. The read-only lists map straight onto the response
// records, which are exactly the columns selected; nothing here is ever
// concatenated into SQL text. UUIDs travel as text and are cast in SQL.
@Mapper
public interface AdminMapper {

    // ---- Overview ----
    AdminSummaryDto summary();

    int ping();

    // ---- Account requests ----
    List<AccountRequestDto> listAccountRequests(@Param("status") String status);

    AccountRequestDto findAccountRequest(@Param("id") String requestId);

    // Locks the request row for the rest of the transaction, so two operators
    // deciding the same request cannot both succeed.
    AccountRequestDto lockAccountRequest(@Param("id") String requestId);

    // The bank account the simulated bank holds under this email, or null. The
    // console never creates one: Third_Party_Bank rows are added in Postgres.
    BankAccountRow findBankAccountByEmail(@Param("email") String email);

    // How many trading accounts already settle to this bank account (0 or 1).
    int countAccountsOnBank(@Param("number") String bankAccountNumber);

    // True once the user has entered the code mailed to their address.
    boolean isEmailVerified(@Param("userId") String userId);

    // Opens the trading account and returns its numeric key (Accounts.id).
    long insertAccount(@Param("userId") String userId,
                       @Param("bankAccountNumber") String bankAccountNumber,
                       @Param("currency") String currency);

    int approveAccountRequest(@Param("id") String requestId,
                              @Param("adminId") String adminId,
                              @Param("bankAccountNumber") String bankAccountNumber,
                              @Param("currency") String currency,
                              @Param("accountId") long accountId);

    int rejectAccountRequest(@Param("id") String requestId,
                             @Param("adminId") String adminId,
                             @Param("reason") String reason);

    // ---- Accounts ----
    List<AdminAccountDto> listAccounts(@Param("q") String q, @Param("status") String status,
                                       @Param("offset") int offset, @Param("limit") int limit);

    long countAccounts(@Param("q") String q, @Param("status") String status);

    AdminAccountDto findAccount(@Param("id") long accountId);

    // Moves an account from one of `from` to `to`; 0 rows when its status is
    // not in `from`, or when closing an account that still has working orders.
    int updateAccountStatus(@Param("id") long accountId,
                            @Param("from") List<String> from,
                            @Param("to") String to,
                            @Param("requireNoWorkingOrders") boolean requireNoWorkingOrders);

    // ---- Instruments ----
    List<AdminInstrumentDto> listInstruments(@Param("q") String q, @Param("exchange") String exchange,
                                             @Param("type") String type, @Param("tradable") Boolean tradable,
                                             @Param("offset") int offset, @Param("limit") int limit);

    long countInstruments(@Param("q") String q, @Param("exchange") String exchange,
                          @Param("type") String type, @Param("tradable") Boolean tradable);

    AdminInstrumentDto findInstrument(@Param("id") String instrumentId);

    // 0 rows when the instrument is already in the requested state.
    int setTradable(@Param("id") String instrumentId, @Param("tradable") boolean tradable,
                    @Param("adminId") String adminId);

    // Null when the ticker already exists (INSERT ... ON CONFLICT DO NOTHING).
    String insertInstrument(@Param("ticker") String ticker, @Param("name") String name,
                            @Param("exchange") String exchange, @Param("currency") String currency,
                            @Param("type") String type, @Param("sector") String sector,
                            @Param("adminId") String adminId);

    // ---- Fees: commission on filled portal orders (Orders.fee_amount) ----
    List<FeeCurrencyRow> feeTotalsByCurrency(@Param("from") LocalDate from, @Param("to") LocalDate to);

    List<FeeUserRow> feesByUser(@Param("from") LocalDate from, @Param("to") LocalDate to, @Param("q") String q,
                                @Param("inrPerUsd") java.math.BigDecimal inrPerUsd,
                                @Param("offset") int offset, @Param("limit") int limit);

    long countFeeUsers(@Param("from") LocalDate from, @Param("to") LocalDate to, @Param("q") String q);

    List<FeeInstrumentRow> feesByInstrument(@Param("from") LocalDate from, @Param("to") LocalDate to);

    // ---- Orders ----
    List<AdminOrderDto> listOrders(@Param("accountId") Long accountId, @Param("symbol") String symbol,
                                   @Param("status") String status, @Param("from") OffsetDateTime from,
                                   @Param("to") OffsetDateTime to,
                                   @Param("offset") int offset, @Param("limit") int limit);

    long countOrders(@Param("accountId") Long accountId, @Param("symbol") String symbol,
                     @Param("status") String status, @Param("from") OffsetDateTime from,
                     @Param("to") OffsetDateTime to);

    // ---- Audit ----
    int insertAudit(@Param("adminId") String adminId, @Param("action") String action,
                    @Param("targetType") String targetType, @Param("targetId") String targetId,
                    @Param("reason") String reason);

    List<AuditEntryDto> listAudit(@Param("offset") int offset, @Param("limit") int limit);

    long countAudit();
}
