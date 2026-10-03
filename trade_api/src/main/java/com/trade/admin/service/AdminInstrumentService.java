package com.trade.admin.service;

import com.trade.admin.AdminException;
import com.trade.admin.dto.AdminDtos.AdminInstrumentDto;
import com.trade.admin.dto.AdminDtos.PageDto;
import com.trade.admin.mapper.AdminMapper;
import com.trade.security.AdminPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;
import java.util.UUID;

// LEAP-022: listing and delisting. Instruments.tradable is what placement
// already checks (INS-404 when false), so a delisting takes effect on the
// next order with no change to the customer path; holdings are untouched.
@Service
public class AdminInstrumentService {

    private static final Set<String> TYPES = Set.of("EQUITY", "BOND", "ETF", "FOREX", "CRYPTO");

    private final AdminMapper mapper;
    private final AdminAuditLog audit;

    public AdminInstrumentService(AdminMapper mapper, AdminAuditLog audit) {
        this.mapper = mapper;
        this.audit = audit;
    }

    public PageDto<AdminInstrumentDto> list(String q, String exchange, String type, Boolean tradable, Paging paging) {
        if (type != null && !TYPES.contains(type)) {
            throw AdminException.invalid("type=" + type);
        }
        String query = Paging.blankToNull(q);
        String exch = Paging.blankToNull(exchange);
        return new PageDto<>(
                mapper.listInstruments(query, exch, type, tradable, paging.offset(), paging.size()),
                paging.page(), paging.size(), mapper.countInstruments(query, exch, type, tradable));
    }

    @Transactional
    public AdminInstrumentDto delist(UUID instrumentId, String reason, AdminPrincipal admin) {
        return setTradable(instrumentId, false, "INSTRUMENT_DELISTED", reason, admin);
    }

    @Transactional
    public AdminInstrumentDto relist(UUID instrumentId, String reason, AdminPrincipal admin) {
        return setTradable(instrumentId, true, "INSTRUMENT_LISTED", reason, admin);
    }

    private AdminInstrumentDto setTradable(UUID instrumentId, boolean tradable, String action, String reason,
                                           AdminPrincipal admin) {
        String id = instrumentId.toString();
        if (mapper.setTradable(id, tradable, admin.userId().toString()) != 1) {
            if (mapper.findInstrument(id) == null) {
                throw AdminException.notFound("instrument " + id);
            }
            throw AdminException.conflict("instrument " + id + " is already " + (tradable ? "listed" : "delisted"));
        }
        AdminInstrumentDto updated = mapper.findInstrument(id);
        audit.record(admin, action, "INSTRUMENT", updated.symbol(), reason.trim());
        return updated;
    }
}
