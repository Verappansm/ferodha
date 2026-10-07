import { EnvironmentProviders, inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AdminAuthService } from './generated/auth/api/admin-auth.service';
import { AdminUsersService } from './generated/auth/api/admin-users.service';
import { AdminProfile } from './generated/auth/model/admin-profile';
import { AdminTokenResponse } from './generated/auth/model/admin-token-response';
import { AdminUser } from './generated/auth/model/admin-user';
import { PlatformRole } from './generated/auth/model/platform-role';
import { UserPage } from './generated/auth/model/user-page';
import { UserStatus } from './generated/auth/model/user-status';
import { provideApi as provideAuthClient } from './generated/auth/provide-api';
import { AdminAccountRequestsService } from './generated/trade/api/admin-account-requests.service';
import { AdminAccountsService } from './generated/trade/api/admin-accounts.service';
import { AdminFeesService } from './generated/trade/api/admin-fees.service';
import { AdminInstrumentsService } from './generated/trade/api/admin-instruments.service';
import { AdminOrdersService } from './generated/trade/api/admin-orders.service';
import { AdminOverviewService } from './generated/trade/api/admin-overview.service';
import { AdminSystemService } from './generated/trade/api/admin-system.service';
import { AccountPage } from './generated/trade/model/account-page';
import { AccountRequest } from './generated/trade/model/account-request';
import { AccountRequestStatus } from './generated/trade/model/account-request-status';
import { AccountStatus } from './generated/trade/model/account-status';
import { AdminAccount } from './generated/trade/model/admin-account';
import { AdminInstrument } from './generated/trade/model/admin-instrument';
import { AdminOrder } from './generated/trade/model/admin-order';
import { AdminOrderStatus } from './generated/trade/model/admin-order-status';
import { AdminSummary } from './generated/trade/model/admin-summary';
import { AuditEntry } from './generated/trade/model/audit-entry';
import { CreateInstrumentRequest } from './generated/trade/model/create-instrument-request';
import { FeeInstrument } from './generated/trade/model/fee-instrument';
import { FeeSummary } from './generated/trade/model/fee-summary';
import { FeeUser } from './generated/trade/model/fee-user';
import { FeeUserPage } from './generated/trade/model/fee-user-page';
import { AuditPage } from './generated/trade/model/audit-page';
import { ComponentHealth } from './generated/trade/model/component-health';
import { InstrumentPage } from './generated/trade/model/instrument-page';
import { InstrumentType } from './generated/trade/model/instrument-type';
import { OrderPage } from './generated/trade/model/order-page';
import { SystemHealth } from './generated/trade/model/system-health';
import { passwordDigest } from '../core/auth/password-digest';
import { provideApi as provideTradeClient } from './generated/trade/provide-api';

export type {
  AccountPage,
  AccountRequest,
  AdminAccount,
  AdminInstrument,
  AdminOrder,
  AdminProfile,
  AdminSummary,
  AdminUser,
  AuditEntry,
  AuditPage,
  ComponentHealth,
  CreateInstrumentRequest,
  FeeInstrument,
  FeeSummary,
  FeeUser,
  FeeUserPage,
  InstrumentPage,
  OrderPage,
  SystemHealth,
  UserPage,
};
export {
  AccountRequestStatus,
  AccountStatus,
  AdminOrderStatus,
  InstrumentType,
  PlatformRole,
  UserStatus,
};

export interface PageQuery {
  page: number;
  size: number;
}

/**
 * Base paths only: no bearer credential is configured on the generated
 * clients, so the admin token interceptor stays the one place that sets
 * Authorization.
 */
export function provideAdminClients(urls: {
  authApiUrl: string;
  tradeApiUrl: string;
}): EnvironmentProviders[] {
  return [provideAuthClient(urls.authApiUrl), provideTradeClient(urls.tradeApiUrl)];
}

/**
 * Every admin call the console makes, over the clients generated from
 * design/admin-trade-api.yaml and design/admin-auth-api.yaml. One plain method
 * per call; pages never touch the generated services directly.
 */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly auth = inject(AdminAuthService);
  private readonly users = inject(AdminUsersService);
  private readonly overview = inject(AdminOverviewService);
  private readonly requests = inject(AdminAccountRequestsService);
  private readonly accounts = inject(AdminAccountsService);
  private readonly instruments = inject(AdminInstrumentsService);
  private readonly fees = inject(AdminFeesService);
  private readonly orders = inject(AdminOrdersService);
  private readonly system = inject(AdminSystemService);

  // ---- Sign-in ----
  /** The password never leaves the browser: only its digest does (B23). */
  login(email: string, password: string): Observable<AdminTokenResponse> {
    return this.auth.adminLogin({ username: email, password: passwordDigest(email, password) });
  }
  profile(): Observable<AdminProfile> {
    return this.auth.getAdminProfile();
  }

  // ---- Overview ----
  summary(): Observable<AdminSummary> {
    return this.overview.getSummary();
  }

  // ---- Account requests ----
  accountRequests(status?: AccountRequestStatus): Observable<AccountRequest[]> {
    return this.requests.listAccountRequests(status);
  }
  /** The bank account is the one the bank holds under the applicant's verified email. */
  approveRequest(id: string, currency: string, note?: string): Observable<AccountRequest> {
    return this.requests.approveAccountRequest(id, { currency, note });
  }
  rejectRequest(id: string, reason: string): Observable<AccountRequest> {
    return this.requests.rejectAccountRequest(id, { reason });
  }

  // ---- Users ----
  listUsers(
    filter: { q?: string; status?: UserStatus; role?: PlatformRole },
    page: PageQuery,
  ): Observable<UserPage> {
    return this.users.listUsers(
      filter.q || undefined,
      filter.status,
      filter.role,
      page.page,
      page.size,
    );
  }
  suspendUser(id: string, reason: string): Observable<AdminUser> {
    return this.users.suspendUser(id, { reason });
  }
  reactivateUser(id: string, reason: string): Observable<AdminUser> {
    return this.users.reactivateUser(id, { reason });
  }
  forcePasswordReset(id: string, reason: string): Observable<AdminUser> {
    return this.users.forcePasswordReset(id, { reason });
  }

  // ---- Accounts ----
  listAccounts(
    filter: { q?: string; status?: AccountStatus },
    page: PageQuery,
  ): Observable<AccountPage> {
    return this.accounts.listAccounts(filter.q || undefined, filter.status, page.page, page.size);
  }
  suspendAccount(id: number, reason: string): Observable<AdminAccount> {
    return this.accounts.suspendAccount(id, { reason });
  }
  reactivateAccount(id: number, reason: string): Observable<AdminAccount> {
    return this.accounts.reactivateAccount(id, { reason });
  }
  closeAccount(id: number, reason: string): Observable<AdminAccount> {
    return this.accounts.closeAccount(id, { reason });
  }

  // ---- Instruments ----
  listInstruments(
    filter: { q?: string; exchange?: string; type?: InstrumentType; tradable?: boolean },
    page: PageQuery,
  ): Observable<InstrumentPage> {
    return this.instruments.listInstruments(
      filter.q || undefined,
      filter.exchange || undefined,
      filter.type,
      filter.tradable,
      page.page,
      page.size,
    );
  }
  addInstrument(request: CreateInstrumentRequest): Observable<AdminInstrument> {
    return this.instruments.addInstrument(request);
  }
  delistInstrument(id: string, reason: string): Observable<AdminInstrument> {
    return this.instruments.delistInstrument(id, { reason });
  }
  relistInstrument(id: string, reason: string): Observable<AdminInstrument> {
    return this.instruments.listInstrument(id, { reason });
  }

  // ---- Fees ----
  feeSummary(): Observable<FeeSummary> {
    return this.fees.getFeeSummary();
  }
  feesByUser(
    filter: { from?: string; to?: string; q?: string },
    page: PageQuery,
  ): Observable<FeeUserPage> {
    return this.fees.listFeesByUser(
      filter.from || undefined,
      filter.to || undefined,
      filter.q || undefined,
      page.page,
      page.size,
    );
  }
  feesByInstrument(filter: { from?: string; to?: string }): Observable<FeeInstrument[]> {
    return this.fees.listFeesByInstrument(filter.from || undefined, filter.to || undefined);
  }

  // ---- Orders ----
  listOrders(
    filter: {
      accountId?: number;
      symbol?: string;
      status?: AdminOrderStatus;
      from?: string;
      to?: string;
    },
    page: PageQuery,
  ): Observable<OrderPage> {
    return this.orders.listOrders(
      filter.accountId,
      filter.symbol || undefined,
      filter.status,
      filter.from,
      filter.to,
      page.page,
      page.size,
    );
  }

  // ---- System ----
  health(): Observable<SystemHealth> {
    return this.system.getSystemHealth();
  }
  audit(page: PageQuery): Observable<AuditPage> {
    return this.system.listAuditEntries(page.page, page.size);
  }
}
