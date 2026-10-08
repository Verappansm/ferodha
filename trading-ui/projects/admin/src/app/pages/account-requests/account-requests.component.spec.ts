import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AccountRequest, AdminApi } from '../../api/admin-api';
import { ADMIN_ERROR_MESSAGES } from '../../core/errors/admin-error-message';
import { ReasonDialogComponent } from '../../shared/reason-dialog.component';
import { AccountRequestsComponent } from './account-requests.component';
import { ApproveDialogComponent } from './approve-dialog.component';

function pending(name: string, requestedAt: string): AccountRequest {
  return {
    requestId: `req-${name}`,
    userId: `user-${name}`,
    applicantName: name,
    applicantEmail: `${name.toLowerCase()}@example.com`,
    currency: 'USD',
    status: 'PENDING',
    requestedAt,
  };
}

describe('AccountRequestsComponent', () => {
  let fixture: ComponentFixture<AccountRequestsComponent>;
  let api: {
    accountRequests: ReturnType<typeof vi.fn>;
    approveRequest: ReturnType<typeof vi.fn>;
    rejectRequest: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    api = {
      accountRequests: vi
        .fn()
        .mockReturnValue(
          of([pending('Newer', '2026-10-02T10:00:00Z'), pending('Older', '2026-09-30T10:00:00Z')]),
        ),
      approveRequest: vi.fn(),
      rejectRequest: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [AccountRequestsComponent],
      providers: [{ provide: AdminApi, useValue: api }],
    }).compileComponents();
    fixture = TestBed.createComponent(AccountRequestsComponent);
    await fixture.whenStable();
  });

  function rows(): HTMLElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
        '[data-testid="request-row"]',
      ),
    );
  }

  function dialog<T>(type: new (...args: never[]) => T): T {
    return fixture.debugElement.query((d) => d.componentInstance instanceof type).componentInstance;
  }

  it('lists pending requests oldest first', () => {
    expect(api.accountRequests).toHaveBeenCalledWith('PENDING');
    expect(rows().map((r) => r.textContent)).toEqual([
      expect.stringContaining('Older'),
      expect.stringContaining('Newer'),
    ]);
  });

  it('approving sends no bank account and no currency (both come from the bank under the verified email), then reloads', async () => {
    const approveDialog = dialog(ApproveDialogComponent);
    vi.spyOn(approveDialog, 'ask').mockResolvedValue({ note: '' });
    api.approveRequest.mockReturnValue(
      of({ ...pending('Older', '2026-09-30T10:00:00Z'), status: 'APPROVED', accountId: 4 }),
    );

    await fixture.componentInstance.approve(pending('Older', '2026-09-30T10:00:00Z'));
    await fixture.whenStable();

    expect(api.approveRequest).toHaveBeenCalledWith('req-Older', undefined);
    expect(fixture.componentInstance.notice()).toContain('account #4 is open');
    expect(api.accountRequests).toHaveBeenCalledTimes(2);
  });

  it('rejecting sends the reason the operator typed', async () => {
    vi.spyOn(dialog(ReasonDialogComponent), 'ask').mockResolvedValue('Documents not verified');
    api.rejectRequest.mockReturnValue(of({ ...pending('Older', 'x'), status: 'REJECTED' }));

    await fixture.componentInstance.reject(pending('Older', '2026-09-30T10:00:00Z'));

    expect(api.rejectRequest).toHaveBeenCalledWith('req-Older', 'Documents not verified');
  });

  it('a cancelled dialog changes nothing', async () => {
    vi.spyOn(dialog(ReasonDialogComponent), 'ask').mockResolvedValue(null);

    await fixture.componentInstance.reject(pending('Older', 'x'));

    expect(api.rejectRequest).not.toHaveBeenCalled();
  });

  it('a request someone else already decided shows the ADM-409 sentence', async () => {
    vi.spyOn(dialog(ReasonDialogComponent), 'ask').mockResolvedValue('Duplicate application');
    api.rejectRequest.mockReturnValue(
      throwError(
        () => new HttpErrorResponse({ status: 409, error: { errorCode: 'ADM-409', message: 'x' } }),
      ),
    );

    await fixture.componentInstance.reject(pending('Older', 'x'));

    expect(fixture.componentInstance.error()).toBe(ADMIN_ERROR_MESSAGES['ADM-409']);
  });
});
