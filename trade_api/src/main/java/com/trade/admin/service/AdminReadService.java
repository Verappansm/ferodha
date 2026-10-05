package com.trade.admin.service;

import com.trade.admin.AdminException;
import com.trade.admin.dto.AdminDtos.AdminOrderDto;
import com.trade.admin.dto.AdminDtos.AdminSummaryDto;
import com.trade.admin.dto.AdminDtos.AuditEntryDto;
import com.trade.admin.dto.AdminDtos.PageDto;
import com.trade.admin.mapper.AdminMapper;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.Set;

// The console's read-only views: overview counts, every order (LEAP-023) and
// the audit log. Never the customer order-history route with its account
// check removed: these queries are the admin's own.
@Service
public class AdminReadService {

    private static final Set<String> ORDER_STATUSES =
            Set.of("NEW", "PARTIALLY_FILLED", "FILLED", "REJECTED", "CANCELLED");

    private final AdminMapper mapper;

    public AdminReadService(AdminMapper mapper) {
        this.mapper = mapper;
    }

    public AdminSummaryDto summary() {
        return mapper.summary();
    }

    public PageDto<AdminOrderDto> orders(Long accountId, String symbol, String status,
                                         OffsetDateTime from, OffsetDateTime to, Paging paging) {
        if (status != null && !ORDER_STATUSES.contains(status)) {
            throw AdminException.invalid("status=" + status);
        }
        if (from != null && to != null && from.isAfter(to)) {
            throw AdminException.invalid("from is after to");
        }
        String ticker = Paging.blankToNull(symbol);
        return new PageDto<>(
                mapper.listOrders(accountId, ticker, status, from, to, paging.offset(), paging.size()),
                paging.page(), paging.size(), mapper.countOrders(accountId, ticker, status, from, to));
    }

    public PageDto<AuditEntryDto> audit(Paging paging) {
        return new PageDto<>(mapper.listAudit(paging.offset(), paging.size()),
                paging.page(), paging.size(), mapper.countAudit());
    }
}
