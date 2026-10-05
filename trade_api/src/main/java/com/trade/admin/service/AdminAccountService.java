package com.trade.admin.service;

import com.trade.admin.AdminException;
import com.trade.admin.dto.AdminDtos.AdminAccountDto;
import com.trade.admin.dto.AdminDtos.PageDto;
import com.trade.admin.mapper.AdminMapper;
import com.trade.security.AdminPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;

// LEAP-021: account status. A SUSPENDED or CLOSED account already answers
// ACC-403 on placement and cancellation (Sprint 5's Account.isActive), so no
// customer-path code changes. Closing is permanent and refused while the
// account has working orders.
@Service
public class AdminAccountService {

    private static final Set<String> STATUSES = Set.of("ACTIVE", "SUSPENDED", "CLOSED");

    private final AdminMapper mapper;
    private final AdminAuditLog audit;

    public AdminAccountService(AdminMapper mapper, AdminAuditLog audit) {
        this.mapper = mapper;
        this.audit = audit;
    }

    public PageDto<AdminAccountDto> list(String q, String status, Paging paging) {
        if (status != null && !STATUSES.contains(status)) {
            throw AdminException.invalid("status=" + status);
        }
        String query = Paging.blankToNull(q);
        return new PageDto<>(
                mapper.listAccounts(query, status, paging.offset(), paging.size()),
                paging.page(), paging.size(), mapper.countAccounts(query, status));
    }

    @Transactional
    public AdminAccountDto suspend(long accountId, String reason, AdminPrincipal admin) {
        return change(accountId, List.of("ACTIVE"), "SUSPENDED", false, "ACCOUNT_SUSPENDED", reason, admin);
    }

    @Transactional
    public AdminAccountDto reactivate(long accountId, String reason, AdminPrincipal admin) {
        return change(accountId, List.of("SUSPENDED"), "ACTIVE", false, "ACCOUNT_REACTIVATED", reason, admin);
    }

    @Transactional
    public AdminAccountDto close(long accountId, String reason, AdminPrincipal admin) {
        return change(accountId, List.of("ACTIVE", "SUSPENDED"), "CLOSED", true, "ACCOUNT_CLOSED", reason, admin);
    }

    private AdminAccountDto change(long accountId, List<String> from, String to, boolean requireNoWorkingOrders,
                                   String action, String reason, AdminPrincipal admin) {
        if (mapper.updateAccountStatus(accountId, from, to, requireNoWorkingOrders) != 1) {
            AdminAccountDto current = mapper.findAccount(accountId);
            if (current == null) {
                throw AdminException.notFound("account " + accountId);
            }
            throw AdminException.conflict("account " + accountId + " is " + current.status()
                    + " with " + current.workingOrders() + " working orders; cannot become " + to);
        }
        audit.record(admin, action, "ACCOUNT", String.valueOf(accountId), reason.trim());
        return mapper.findAccount(accountId);
    }
}
