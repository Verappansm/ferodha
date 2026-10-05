package com.trade.admin.service;

import com.trade.admin.mapper.AdminMapper;
import com.trade.security.AdminPrincipal;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// Writes one admin_audit row per decision. MANDATORY: it must join the
// transaction of the change it records, so a decision is never recorded
// without happening, or the other way round.
@Component
public class AdminAuditLog {

    private final AdminMapper mapper;

    public AdminAuditLog(AdminMapper mapper) {
        this.mapper = mapper;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void record(AdminPrincipal admin, String action, String targetType, String targetId, String reason) {
        mapper.insertAudit(admin.userId().toString(), action, targetType, targetId, reason);
    }
}
