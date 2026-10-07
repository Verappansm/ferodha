import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { AdminApi } from '../../api/admin-api';
import { FeesComponent } from './fees.component';

const SUMMARY = {
  currency: 'USD',
  totalFees: 22.5,
  feesThisMonth: 3,
  feeOrders: 10,
  byCurrency: [
    { currency: 'INR', orders: 4, fees: 900 },
    { currency: 'USD', orders: 6, fees: 12.5 },
  ],
  partial: false,
};

const USERS = {
  items: [
    {
      userId: 'u1',
      name: 'John Carter',
      email: 'john@example.com',
      accountId: 1,
      currency: 'USD',
      orders: 3,
      fees: 4.5,
      feesUsd: 4.5,
    },
    {
      userId: 'u2',
      name: 'Priya Menon',
      email: 'priya@example.com',
      accountId: 2,
      currency: 'INR',
      orders: 2,
      fees: 450,
      feesUsd: 5,
    },
  ],
  page: 0,
  size: 25,
  totalItems: 2,
};

const INSTRUMENTS = [
  { symbol: 'AAPL', name: 'Apple Inc.', orders: 4, feesUsd: 7.5 },
  { symbol: 'MSFT', name: 'Microsoft', orders: 1, feesUsd: 2.5 },
];

describe('FeesComponent', () => {
  let fixture: ComponentFixture<FeesComponent>;
  let feeSummary: ReturnType<typeof vi.fn>;
  let feesByUser: ReturnType<typeof vi.fn>;
  let feesByInstrument: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    feeSummary = vi.fn().mockReturnValue(of(SUMMARY));
    feesByUser = vi.fn().mockReturnValue(of(USERS));
    feesByInstrument = vi.fn().mockReturnValue(of(INSTRUMENTS));
    await TestBed.configureTestingModule({
      imports: [FeesComponent],
      providers: [{ provide: AdminApi, useValue: { feeSummary, feesByUser, feesByInstrument } }],
    }).compileComponents();
    fixture = TestBed.createComponent(FeesComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  });

  function el(testId: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  }
  function text(testId: string): string {
    return el(testId)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }
  function rows(testId: string): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll(`[data-testid="${testId}"]`));
  }
  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows the total and this month, and what the total was charged in', () => {
    expect(text('fees-total')).toContain('22.50');
    expect(text('fees-month')).toContain('3.00');
    expect(text('fees-by-currency')).toContain('900.00 INR');
    expect(text('fees-by-currency')).toContain('12.50 USD');
  });

  it('opens on the per-user table, each customer in their own currency and in USD', () => {
    const [john, priya] = rows('fees-user-row');
    expect(john.textContent).toContain('John Carter');
    expect(john.textContent).toContain('4.50 USD');
    expect(priya.textContent).toContain('450.00 INR');
    expect(priya.textContent).toContain('5.00');
    expect(feesByUser).toHaveBeenCalledWith({ q: '' }, { page: 0, size: 25 });
  });

  it('switches to the per-instrument table with each instrument share of the fees', async () => {
    (el('fees-tab-instrument') as HTMLButtonElement).click();
    await settle();
    expect(feesByInstrument).toHaveBeenCalledWith({});
    const [aapl] = rows('fees-instrument-row');
    expect(aapl.textContent).toContain('AAPL');
    expect(aapl.textContent).toContain('7.50');
    expect(aapl.textContent).toContain('75%');
  });

  it('quick ranges fill the dates and reload: the last 7 days, this month, then all time', async () => {
    (el('fees-range-7d') as HTMLButtonElement).click();
    await settle();
    const call = feesByUser.mock.lastCall![0] as { from: string; to: string };
    const days = (new Date(call.to).getTime() - new Date(call.from).getTime()) / 86_400_000;
    expect(days).toBe(6);
    expect(fixture.componentInstance.range()).toBe('7d');

    (el('fees-range-month') as HTMLButtonElement).click();
    await settle();
    const month = feesByUser.mock.lastCall![0] as { from: string };
    expect(month.from.endsWith('-01')).toBe(true);

    (el('fees-range-all') as HTMLButtonElement).click();
    await settle();
    expect(feesByUser).toHaveBeenLastCalledWith({ q: '' }, { page: 0, size: 25 });
  });

  it('shows initials for each customer and a bar sized against the biggest payer', () => {
    const [john, priya] = rows('fees-user-row');
    expect(john.querySelector('.avatar')?.textContent?.trim()).toBe('JC');
    expect(priya.querySelector('.avatar')?.textContent?.trim()).toBe('PM');
    const widths = rows('fees-user-bar').map((bar) => bar.style.width);
    expect(widths).toEqual(['90%', '100%']); // 4.50 against the top payer's 5.00
  });

  it('applies the date range and the customer search to the per-user table', async () => {
    const form = fixture.componentInstance.filters;
    form.setValue({ q: 'john', from: '2026-10-01', to: '2026-10-31' });
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    await settle();
    expect(feesByUser).toHaveBeenLastCalledWith(
      { from: '2026-10-01', to: '2026-10-31', q: 'john' },
      { page: 0, size: 25 },
    );
  });

  it('refuses a range that ends before it starts, without asking the server', async () => {
    feesByUser.mockClear();
    fixture.componentInstance.filters.setValue({ q: '', from: '2026-10-31', to: '2026-10-01' });
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    await settle();
    expect(feesByUser).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('"from" date must be on or before');
  });

  it('shows an empty state when nothing was charged in the period', async () => {
    feesByUser.mockReturnValue(of({ items: [], page: 0, size: 25, totalItems: 0 }));
    fixture.componentInstance.apply();
    await settle();
    expect(el('fees-empty')).toBeTruthy();
  });

  it('shows a readable message when the fees cannot be loaded', async () => {
    feesByUser.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    fixture.componentInstance.apply();
    await settle();
    expect(fixture.nativeElement.textContent).toContain('could not be reached');
  });
});
