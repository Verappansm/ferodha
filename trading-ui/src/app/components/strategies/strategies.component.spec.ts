import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { StrategiesComponent, strategyError } from './strategies.component';
import { StrategyResponse, TradeApi } from '../../api/trade-api';

function strategy(overrides: Partial<StrategyResponse> = {}): StrategyResponse {
  return {
    strategyId: 's-1',
    name: 'Buy the dip',
    symbol: 'AAPL',
    side: 'BUY',
    triggerPrice: 100,
    quantity: 50,
    maxSpend: 6000,
    maxPosition: 100,
    maxOrders: 1,
    maxFailures: 3,
    dryRun: false,
    status: 'DISABLED',
    ordersPlaced: 0,
    consecutiveFailures: 0,
    expiresAt: null,
    createdAt: '2026-10-07T10:00:00Z',
    ...overrides,
  };
}

describe('StrategiesComponent', () => {
  let fixture: ComponentFixture<StrategiesComponent>;
  let strategies: ReturnType<typeof vi.fn>;
  let createStrategy: ReturnType<typeof vi.fn>;
  let enableStrategy: ReturnType<typeof vi.fn>;
  let disableStrategy: ReturnType<typeof vi.fn>;
  let strategyEvents: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    strategies = vi.fn().mockReturnValue(of([strategy()]));
    createStrategy = vi.fn().mockReturnValue(of(strategy()));
    enableStrategy = vi.fn().mockReturnValue(of(strategy({ status: 'ENABLED' })));
    disableStrategy = vi.fn().mockReturnValue(of(strategy({ status: 'DISABLED' })));
    strategyEvents = vi
      .fn()
      .mockReturnValue(
        of([
          {
            at: '2026-10-07T10:01:00Z',
            kind: 'BLOCKED',
            detail: 'Max spend 6000 would be exceeded',
          },
        ]),
      );
    await TestBed.configureTestingModule({
      imports: [StrategiesComponent],
      providers: [
        {
          provide: TradeApi,
          useValue: { strategies, createStrategy, enableStrategy, disableStrategy, strategyEvents },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StrategiesComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  });

  function el(testId: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  }

  function text(testId: string): string {
    return el(testId)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function type(testId: string, value: string): void {
    const input = el(testId) as HTMLInputElement | HTMLSelectElement;
    input.value = value;
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input'));
  }

  it('lists the strategies with the rule as a sentence and the status', () => {
    expect(text('strategy-rule')).toBe('Buy 50 AAPL when the ask falls to 100.00 or below');
    expect(text('strategy-status')).toBe('DISABLED');
  });

  it('shows an empty state when there are none', async () => {
    strategies.mockReturnValue(of([]));
    await fixture.componentInstance.refresh();
    await settle();
    expect(el('strategies-empty')).toBeTruthy();
  });

  it('enables a strategy and shows its new status', async () => {
    (el('strategy-enable') as HTMLButtonElement).click();
    await settle();
    expect(enableStrategy).toHaveBeenCalledWith('s-1');
    expect(text('strategy-status')).toBe('ENABLED');
    expect(el('strategy-disable')).toBeTruthy();
  });

  it('disables a running strategy', async () => {
    strategies.mockReturnValue(of([strategy({ status: 'ENABLED' })]));
    await fixture.componentInstance.refresh();
    await settle();
    (el('strategy-disable') as HTMLButtonElement).click();
    await settle();
    expect(disableStrategy).toHaveBeenCalledWith('s-1');
    expect(text('strategy-status')).toBe('DISABLED');
  });

  it('offers re-enabling a tripped strategy', async () => {
    strategies.mockReturnValue(of([strategy({ status: 'TRIPPED', consecutiveFailures: 3 })]));
    await fixture.componentInstance.refresh();
    await settle();
    expect(text('strategy-enable')).toBe('Re-enable');
  });

  it('shows the activity log of a strategy', async () => {
    (el('strategy-activity') as HTMLButtonElement).click();
    await settle();
    expect(strategyEvents).toHaveBeenCalledWith('s-1');
    expect(text('strategy-event')).toContain('BLOCKED');
    expect(text('strategy-event')).toContain('Max spend 6000 would be exceeded');
  });

  it('a BUY without caps is blocked before anything is sent', async () => {
    (el('strategy-new') as HTMLButtonElement).click();
    await settle();
    type('strategy-name', 'dip');
    type('strategy-symbol', 'aapl');
    type('strategy-trigger', '100');
    type('strategy-quantity', '50');
    (el('strategy-save') as HTMLButtonElement).click();
    await settle();
    expect(createStrategy).not.toHaveBeenCalled();
    expect(text('strategy-form-hint')).toContain('max spend and a max position');
  });

  it('creates a BUY with its caps, upper-casing the symbol', async () => {
    (el('strategy-new') as HTMLButtonElement).click();
    await settle();
    type('strategy-name', ' dip ');
    type('strategy-symbol', 'aapl');
    type('strategy-trigger', '100');
    type('strategy-quantity', '50');
    type('strategy-max-spend', '6000');
    type('strategy-max-position', '100');
    (el('strategy-save') as HTMLButtonElement).click();
    await settle();
    expect(createStrategy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'dip',
        symbol: 'AAPL',
        side: 'BUY',
        triggerPrice: 100,
        quantity: 50,
        maxSpend: 6000,
        maxPosition: 100,
        maxOrders: 1,
        maxFailures: 3,
        dryRun: false,
        expiresAt: null,
      }),
    );
    expect(el('strategy-form')).toBeNull();
    expect(text('strategy-notice')).toContain('disabled until you enable it');
  });

  it('a SELL needs no caps', async () => {
    (el('strategy-new') as HTMLButtonElement).click();
    await settle();
    type('strategy-side', 'SELL');
    fixture.detectChanges();
    expect(el('strategy-max-spend')).toBeNull();
    type('strategy-name', 'exit');
    type('strategy-symbol', 'AAPL');
    type('strategy-trigger', '120');
    type('strategy-quantity', '10');
    (el('strategy-save') as HTMLButtonElement).click();
    await settle();
    expect(createStrategy).toHaveBeenCalledWith(
      expect.objectContaining({ side: 'SELL', maxSpend: null, maxPosition: null }),
    );
  });

  it('shows the strategy service sentence when an action is refused', async () => {
    enableStrategy.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: {
              errorCode: 'STR-409',
              message: 'This strategy cannot be enabled: it has expired',
            },
          }),
      ),
    );
    (el('strategy-enable') as HTMLButtonElement).click();
    await settle();
    expect(text('strategy-error')).toBe('This strategy cannot be enabled: it has expired');
  });

  it('strategyError uses the shared catalogue for everything else', () => {
    expect(strategyError(new HttpErrorResponse({ status: 0 }))).toContain('could not be reached');
  });
});
