package com.trade.admin.web;

import com.trade.admin.dto.AdminDtos.AccountRequestDto;
import com.trade.admin.dto.AdminDtos.AdminAccountDto;
import com.trade.admin.dto.AdminDtos.AdminInstrumentDto;
import com.trade.admin.dto.AdminDtos.AdminOrderDto;
import com.trade.admin.dto.AdminDtos.AdminSummaryDto;
import com.trade.admin.dto.AdminDtos.ApproveAccountRequest;
import com.trade.admin.dto.AdminDtos.AuditEntryDto;
import com.trade.admin.dto.AdminDtos.PageDto;
import com.trade.admin.dto.AdminDtos.ReasonRequest;
import com.trade.admin.dto.AdminDtos.SystemHealthDto;
import com.trade.admin.service.AdminAccountRequestService;
import com.trade.admin.service.AdminAccountService;
import com.trade.admin.service.AdminInstrumentService;
import com.trade.admin.service.AdminReadService;
import com.trade.admin.service.Paging;
import com.trade.admin.service.SystemHealthService;
import com.trade.security.AdminPrincipal;
import com.trade.security.JwtAuthFilter;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

// The routes of design/admin-trade-api.yaml. JwtAuthFilter has already
// refused anything but an admin console token before a request gets here,
// and put the verified operator in the request; handlers only delegate.
@RestController
@RequestMapping("/api/v1/admin")
public class AdminController {

    private static final String ADMIN = JwtAuthFilter.ADMIN_PRINCIPAL_ATTRIBUTE;

    private final AdminReadService reads;
    private final AdminAccountRequestService requests;
    private final AdminAccountService accounts;
    private final AdminInstrumentService instruments;
    private final SystemHealthService health;

    public AdminController(AdminReadService reads, AdminAccountRequestService requests,
                           AdminAccountService accounts, AdminInstrumentService instruments,
                           SystemHealthService health) {
        this.reads = reads;
        this.requests = requests;
        this.accounts = accounts;
        this.instruments = instruments;
        this.health = health;
    }

    // ---- Overview ----

    @GetMapping("/summary")
    public AdminSummaryDto summary() {
        return reads.summary();
    }

    // ---- Account requests ----

    @GetMapping("/account-requests")
    public List<AccountRequestDto> accountRequests(@RequestParam(required = false) String status) {
        return requests.list(status);
    }

    @PostMapping("/account-requests/{id}/approve")
    public AccountRequestDto approve(@PathVariable UUID id, @Valid @RequestBody ApproveAccountRequest body,
                                     @RequestAttribute(ADMIN) AdminPrincipal admin) {
        return requests.approve(id, body, admin);
    }

    @PostMapping("/account-requests/{id}/reject")
    public AccountRequestDto reject(@PathVariable UUID id, @Valid @RequestBody ReasonRequest body,
                                    @RequestAttribute(ADMIN) AdminPrincipal admin) {
        return requests.reject(id, body.reason(), admin);
    }

    // ---- Accounts ----

    @GetMapping("/accounts")
    public PageDto<AdminAccountDto> accounts(@RequestParam(required = false) String q,
                                             @RequestParam(required = false) String status,
                                             @RequestParam(defaultValue = "0") int page,
                                             @RequestParam(defaultValue = "25") int size) {
        return accounts.list(q, status, new Paging(page, size));
    }

    @PostMapping("/accounts/{id}/suspend")
    public AdminAccountDto suspendAccount(@PathVariable long id, @Valid @RequestBody ReasonRequest body,
                                          @RequestAttribute(ADMIN) AdminPrincipal admin) {
        return accounts.suspend(id, body.reason(), admin);
    }

    @PostMapping("/accounts/{id}/reactivate")
    public AdminAccountDto reactivateAccount(@PathVariable long id, @Valid @RequestBody ReasonRequest body,
                                             @RequestAttribute(ADMIN) AdminPrincipal admin) {
        return accounts.reactivate(id, body.reason(), admin);
    }

    @PostMapping("/accounts/{id}/close")
    public AdminAccountDto closeAccount(@PathVariable long id, @Valid @RequestBody ReasonRequest body,
                                        @RequestAttribute(ADMIN) AdminPrincipal admin) {
        return accounts.close(id, body.reason(), admin);
    }

    // ---- Instruments ----

    @GetMapping("/instruments")
    public PageDto<AdminInstrumentDto> instruments(@RequestParam(required = false) String q,
                                                   @RequestParam(required = false) String exchange,
                                                   @RequestParam(required = false) String type,
                                                   @RequestParam(required = false) Boolean tradable,
                                                   @RequestParam(defaultValue = "0") int page,
                                                   @RequestParam(defaultValue = "25") int size) {
        return instruments.list(q, exchange, type, tradable, new Paging(page, size));
    }

    @PostMapping("/instruments/{id}/delist")
    public AdminInstrumentDto delist(@PathVariable UUID id, @Valid @RequestBody ReasonRequest body,
                                     @RequestAttribute(ADMIN) AdminPrincipal admin) {
        return instruments.delist(id, body.reason(), admin);
    }

    @PostMapping("/instruments/{id}/list")
    public AdminInstrumentDto list(@PathVariable UUID id, @Valid @RequestBody ReasonRequest body,
                                   @RequestAttribute(ADMIN) AdminPrincipal admin) {
        return instruments.relist(id, body.reason(), admin);
    }

    // ---- Orders, health, audit ----

    @GetMapping("/orders")
    public PageDto<AdminOrderDto> orders(
            @RequestParam(required = false) Long accountId,
            @RequestParam(required = false) String symbol,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size) {
        return reads.orders(accountId, symbol, status, from, to, new Paging(page, size));
    }

    @GetMapping("/health")
    public SystemHealthDto health() {
        return health.check();
    }

    @GetMapping("/audit")
    public PageDto<AuditEntryDto> audit(@RequestParam(defaultValue = "0") int page,
                                        @RequestParam(defaultValue = "25") int size) {
        return reads.audit(new Paging(page, size));
    }
}
