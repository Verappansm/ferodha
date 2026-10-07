package com.trade.admin.service;

import com.trade.admin.AdminException;
import com.trade.admin.dto.AdminDtos.AccountRequestDto;
import com.trade.admin.dto.AdminDtos.AdminAccountDto;
import com.trade.admin.dto.AdminDtos.AdminInstrumentDto;
import com.trade.admin.dto.AdminDtos.ApproveAccountRequest;
import com.trade.admin.mapper.AdminMapper;
import com.trade.admin.mapper.BankAccountRow;
import com.trade.security.AdminPrincipal;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// The decision rules of the admin services, against a mocked mapper. The SQL
// itself is exercised only against a real Postgres (not on this machine).
class AdminServicesTest {

    private static final UUID REQUEST = UUID.fromString("0e7c3b1a-1111-4a4a-8a8a-222222222222");
    private static final AdminPrincipal ADMIN =
            new AdminPrincipal(UUID.fromString("55555555-5555-5555-5555-555555555555"), List.of("ADMIN"));

    private final AdminMapper mapper = mock(AdminMapper.class);
    private final AdminAuditLog audit = mock(AdminAuditLog.class);
    private final AdminAccountRequestService requests = new AdminAccountRequestService(mapper, audit);
    private final AdminAccountService accounts = new AdminAccountService(mapper, audit);
    private final AdminInstrumentService instruments = new AdminInstrumentService(mapper, audit);

    private static AccountRequestDto request(String status) {
        return new AccountRequestDto(REQUEST.toString(), "77777777-7777-7777-7777-777777777771",
                "Priya Menon", "priya@example.com", "USD", status,
                OffsetDateTime.parse("2026-10-01T09:00:00Z"), null, null, null, null);
    }

    @Test
    @DisplayName("Approving opens exactly one account on the bank account held under the verified email, and records the decision")
    void approveOpensOneAccount() {
        givenVerifiedApplicantWithBank();
        when(mapper.insertAccount(anyString(), anyString(), anyString())).thenReturn(4L);
        when(mapper.approveAccountRequest(anyString(), anyString(), anyString(), anyString(), anyLong()))
                .thenReturn(1);

        requests.approve(REQUEST, new ApproveAccountRequest(null, "USD", ""), ADMIN);

        verify(mapper).insertAccount("77777777-7777-7777-7777-777777777771", "BANK-100004", "USD");
        verify(mapper).approveAccountRequest(REQUEST.toString(), ADMIN.userId().toString(), "BANK-100004", "USD", 4L);
        verify(audit).record(ADMIN, "ACCOUNT_REQUEST_APPROVED", "ACCOUNT_REQUEST", REQUEST.toString(), null);
    }

    @Test
    @DisplayName("A request already decided cannot be decided again")
    void decidedRequestIsAConflict() {
        when(mapper.lockAccountRequest(REQUEST.toString())).thenReturn(request("APPROVED"));

        AdminException e = assertThrows(AdminException.class,
                () -> requests.reject(REQUEST, "Duplicate application", ADMIN));
        assertEquals("ADM-409", e.getCode());
        verify(mapper, never()).rejectAccountRequest(anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("An unknown request is ADM-404")
    void unknownRequestIsNotFound() {
        AdminException e = assertThrows(AdminException.class,
                () -> requests.reject(REQUEST, "Duplicate application", ADMIN));
        assertEquals("ADM-404", e.getCode());
    }

    private void givenVerifiedApplicantWithBank() {
        when(mapper.lockAccountRequest(REQUEST.toString())).thenReturn(request("PENDING"));
        when(mapper.isEmailVerified("77777777-7777-7777-7777-777777777771")).thenReturn(true);
        when(mapper.findBankAccountByEmail("priya@example.com"))
                .thenReturn(new BankAccountRow("BANK-100004", "priya@example.com"));
    }

    private void assertRefused(ApproveAccountRequest body) {
        AdminException e = assertThrows(AdminException.class, () -> requests.approve(REQUEST, body, ADMIN));
        assertEquals("ADM-409", e.getCode());
        verify(mapper, never()).insertAccount(anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("An applicant who has not entered the emailed code is not approved")
    void unverifiedEmailIsRefused() {
        when(mapper.lockAccountRequest(REQUEST.toString())).thenReturn(request("PENDING"));
        when(mapper.isEmailVerified("77777777-7777-7777-7777-777777777771")).thenReturn(false);
        assertRefused(new ApproveAccountRequest(null, "USD", null));
    }

    @Test
    @DisplayName("If the bank holds no account under the applicant's email, nothing is opened and none is created")
    void noBankAccountUnderTheEmailIsRefused() {
        when(mapper.lockAccountRequest(REQUEST.toString())).thenReturn(request("PENDING"));
        when(mapper.isEmailVerified("77777777-7777-7777-7777-777777777771")).thenReturn(true);
        when(mapper.findBankAccountByEmail("priya@example.com")).thenReturn(null);
        assertRefused(new ApproveAccountRequest(null, "USD", null));
    }

    @Test
    @DisplayName("An operator cannot point the applicant at a different bank account")
    void someoneElsesBankAccountIsRefused() {
        givenVerifiedApplicantWithBank();
        assertRefused(new ApproveAccountRequest("BANK-100001", "USD", null));
    }

    @Test
    @DisplayName("A bank account that already backs a trading account is never linked a second time")
    void bankAccountAlreadyLinkedIsRefused() {
        givenVerifiedApplicantWithBank();
        when(mapper.countAccountsOnBank("BANK-100004")).thenReturn(1);
        assertRefused(new ApproveAccountRequest(null, "USD", null));
    }

    @Test
    @DisplayName("Closing an account with working orders is refused and nothing is recorded")
    void closeWithWorkingOrdersIsAConflict() {
        when(mapper.updateAccountStatus(eq(1L), any(), eq("CLOSED"), eq(true))).thenReturn(0);
        when(mapper.findAccount(1L)).thenReturn(new AdminAccountDto(1L, "ACC-000001", "John Carter",
                "john.carter@example.com", "USD", new BigDecimal("15000"), "ACTIVE", 2,
                OffsetDateTime.parse("2026-01-01T00:00:00Z")));

        AdminException e = assertThrows(AdminException.class,
                () -> accounts.close(1L, "Customer request", ADMIN));
        assertEquals("ADM-409", e.getCode());
        verify(audit, never()).record(any(), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("Suspending an ACTIVE account records who did it and why")
    void suspendRecordsTheDecision() {
        when(mapper.updateAccountStatus(eq(1L), eq(List.of("ACTIVE")), eq("SUSPENDED"), eq(false))).thenReturn(1);

        accounts.suspend(1L, "  Fraud review  ", ADMIN);

        verify(audit).record(ADMIN, "ACCOUNT_SUSPENDED", "ACCOUNT", "1", "Fraud review");
    }

    @Test
    @DisplayName("Delisting an instrument that is already delisted is ADM-409")
    void delistingTwiceIsAConflict() {
        UUID id = UUID.randomUUID();
        when(mapper.setTradable(eq(id.toString()), eq(false), anyString())).thenReturn(0);
        when(mapper.findInstrument(id.toString())).thenReturn(new AdminInstrumentDto(id.toString(), "AAPL",
                "Apple Inc.", "NASDAQ", "USD", "EQUITY", "Technology", false, null, null));

        AdminException e = assertThrows(AdminException.class,
                () -> instruments.delist(id, "Corporate action", ADMIN));
        assertEquals("ADM-409", e.getCode());
    }

    @Test
    @DisplayName("Page size is bounded to 1-100")
    void pagingIsBounded() {
        assertThrows(AdminException.class, () -> new Paging(0, 0));
        assertThrows(AdminException.class, () -> new Paging(0, 101));
        assertThrows(AdminException.class, () -> new Paging(-1, 25));
        assertEquals(50, new Paging(2, 25).offset());
    }

    @Test
    @DisplayName("An unknown status filter is VAL-422")
    void unknownStatusFilterIsInvalid() {
        AdminException e = assertThrows(AdminException.class, () -> requests.list("MAYBE"));
        assertEquals("VAL-422", e.getCode());
        assertEquals("VAL-422", assertThrows(AdminException.class,
                () -> accounts.list(null, "OPEN", new Paging(0, 25))).getCode());
        verify(mapper, never()).countAccounts(any(), any());
    }
}
