package com.trade.admin.service;

import com.trade.admin.AdminException;
import com.trade.admin.dto.AdminDtos.AccountRequestDto;
import com.trade.admin.dto.AdminDtos.ApproveAccountRequest;
import com.trade.admin.mapper.AdminMapper;
import com.trade.admin.mapper.BankAccountRow;
import com.trade.security.AdminPrincipal;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;
import java.util.UUID;

// LEAP-011: deciding account-opening requests. Approving opens exactly one
// Accounts row (trade_api owns that table); the request row is locked for
// the whole transaction, so two operators deciding at once cannot both win.
@Service
public class AdminAccountRequestService {

    private static final Logger log = LoggerFactory.getLogger(AdminAccountRequestService.class);
    private static final Set<String> STATUSES = Set.of("PENDING", "APPROVED", "REJECTED");

    private final AdminMapper mapper;
    private final AdminAuditLog audit;

    public AdminAccountRequestService(AdminMapper mapper, AdminAuditLog audit) {
        this.mapper = mapper;
        this.audit = audit;
    }

    public List<AccountRequestDto> list(String status) {
        if (status != null && !STATUSES.contains(status)) {
            throw AdminException.invalid("status=" + status);
        }
        return mapper.listAccountRequests(status);
    }

    @Transactional
    public AccountRequestDto approve(UUID requestId, ApproveAccountRequest body, AdminPrincipal admin) {
        AccountRequestDto request = lockPending(requestId);

        // The applicant proved the email is theirs by entering the code mailed to it,
        // and the bank holds an account under that same email: that account, and only
        // that one, is theirs. Operators cannot create or pick a bank account.
        if (!mapper.isEmailVerified(request.userId())) {
            throw AdminException.conflict("the applicant has not verified their email yet");
        }
        BankAccountRow bank = mapper.findBankAccountByEmail(request.applicantEmail());
        if (bank == null) {
            throw AdminException.conflict("the bank holds no account under " + request.applicantEmail());
        }
        String bankAccount = bank.bankAccountNumber();
        String named = body.bankAccountNumber() == null ? "" : body.bankAccountNumber().trim();
        if (!named.isEmpty() && !named.equals(bankAccount)) {
            throw AdminException.conflict("bank account " + named + " is not the one held under the applicant's email");
        }
        if (mapper.countAccountsOnBank(bankAccount) > 0) {
            throw AdminException.conflict("bank account " + bankAccount + " is already linked to an account");
        }

        long accountId = mapper.insertAccount(request.userId(), bankAccount, body.currency());
        if (mapper.approveAccountRequest(requestId.toString(), admin.userId().toString(),
                bankAccount, body.currency(), accountId) != 1) {
            throw AdminException.conflict("request " + requestId + " was decided concurrently");
        }
        audit.record(admin, "ACCOUNT_REQUEST_APPROVED", "ACCOUNT_REQUEST", requestId.toString(),
                blankToNull(body.note()));
        log.info("Account request {} approved by {}: account {} opened", requestId, admin.userId(), accountId);
        return mapper.findAccountRequest(requestId.toString());
    }

    @Transactional
    public AccountRequestDto reject(UUID requestId, String reason, AdminPrincipal admin) {
        lockPending(requestId);
        if (mapper.rejectAccountRequest(requestId.toString(), admin.userId().toString(), reason.trim()) != 1) {
            throw AdminException.conflict("request " + requestId + " was decided concurrently");
        }
        audit.record(admin, "ACCOUNT_REQUEST_REJECTED", "ACCOUNT_REQUEST", requestId.toString(), reason.trim());
        log.info("Account request {} rejected by {}", requestId, admin.userId());
        return mapper.findAccountRequest(requestId.toString());
    }

    private AccountRequestDto lockPending(UUID requestId) {
        AccountRequestDto request = mapper.lockAccountRequest(requestId.toString());
        if (request == null) {
            throw AdminException.notFound("account request " + requestId);
        }
        if (!"PENDING".equals(request.status())) {
            throw AdminException.conflict("account request " + requestId + " is " + request.status());
        }
        return request;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
