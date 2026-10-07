import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { StrategiesComponent, strategyError } from './strategies.component';
import { StrategyResponse, TradeApi } from '../../api/trade-api';
import { Session } from '../../core/session/session';

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
    lastPrice: null,
    lastCheckedAt: null,
    ...overrides,
  };
}

const INSTRUMENTS = {
  instruments: [
    { symbol: 'AAPL', name: 'Apple Inc.' },
    { symbol: 'MSFT', name: 'Microsoft Corporation' },
    { symbol: 'NVDA', name: 'NVIDIA Corporation' },
  ],
  total: 3,
};

describe('StrategiesComponent', () => {
  let fixture: ComponentFixture<StrategiesComponent>;
  let strategies: ReturnType<typeof vi.fn>;
  let createStrategy: ReturnType<typeof vi.fn>;
  let enableStrategy: ReturnType<typeof vi.fn>;
  let disableStrategy: ReturnType<typeof vi.fn>;
  let strategyEvents: ReturnType<typeof vi.fn>;
  let positions: ReturnType<typeof vi.fn>;
  let quote: ReturnType<typeof vi.fn>;

  async function setup(held: { symbol: string; quantity: number }[] = []): Promise<void> {
    positions = vi.fn().mockReturnValue(of(held));
    await TestBed.configureTestingModule({
      imports: [StrategiesComponent],
      providers: [
        { provide: Session, useValue: { accountId: () => 3 } },
        {
          provide: TradeApi,
          useValue: {
            strategies,
            createStrategy,
            enableStrategy,
            disableStrategy,
            strategyEvents,
            positions,
            quote,
            getInstruments: vi.fn().mockReturnValue(of(INSTRUMENTS)),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StrategiesComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
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
    quote = vi
      .fn()
      .mockReturnValue(of({ symbol: 'AAPL', currency: 'USD', bid: 99.8, ask: 99.9, mid: 99.85 }));
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

  function options(): string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll(
        '[data-testid="symbol-option"]',
      ) as NodeListOf<HTMLElement>,
    ).map((o) => o.querySelector('strong')?.textContent ?? '');
  }

  /** Types into the symbol search and clicks the option for `symbol`. */
  async function pick(symbol: string, search = symbol): Promise<void> {
    const input = el('strategy-symbol') as HTMLInputElement;
    input.dispatchEvent(new Event('focus'));
    input.value = search;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const option = Array.from(
      fixture.nativeElement.querySelectorAll(
        '[data-testid="symbol-option"]',
      ) as NodeListOf<HTMLElement>,
    ).find((o) => o.querySelector('strong')?.textContent === symbol);
    option!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await settle();
  }

  async function openForm(): Promise<void> {
    (el('strategy-new') as HTMLButtonElement).click();
    await settle();
  }

  describe('the list', () => {
    beforeEach(async () => setup());

    it('lists the strategies with the rule as a sentence and the status', () => {
      expect(text('strategy-rule')).toBe('Buy 50 AAPL when the ask falls to 100.00 or below');
      expect(text('strategy-status')).toBe('DISABLED');
    });

    it('shows the price a running strategy last watched, or that it is waiting', async () => {
      strategies.mockReturnValue(
        of([
          strategy({ status: 'ENABLED', lastPrice: 99.9, lastCheckedAt: '2026-10-07T10:01:05Z' }),
        ]),
      );
      await fixture.componentInstance.refresh();
      await settle();
      expect(text('strategy-watching')).toContain('99.90');

      strategies.mockReturnValue(of([strategy({ status: 'ENABLED' })]));
      await fixture.componentInstance.refresh();
      await settle();
      expect(text('strategy-watching')).toBe('Waiting for a price');
    });

    it('explains every heading with an info note that opens on click', async () => {
      const buttons = fixture.nativeElement.querySelectorAll('th app-info-tip button');
      expect(buttons.length).toBe(8);
      expect(fixture.nativeElement.querySelector('[role="tooltip"]')).toBeNull();

      (buttons[1] as HTMLButtonElement).click();
      await settle();
      expect(fixture.nativeElement.querySelector('[role="tooltip"]').textContent).toContain(
        'A BUY watches the ask',
      );
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

  describe('creating a buy', () => {
    beforeEach(async () => {
      await setup();
      await openForm();
    });

    it('searches the existing instruments by symbol or company name', async () => {
      const input = el('strategy-symbol') as HTMLInputElement;
      input.dispatchEvent(new Event('focus'));
      fixture.detectChanges();
      expect(options()).toEqual(['AAPL', 'MSFT', 'NVDA']);

      input.value = 'micro';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(options()).toEqual(['MSFT']);

      input.value = 'zzz';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(options()).toEqual([]);
    });

    it('blocks a buy without caps and without a chosen symbol before anything is sent', async () => {
      type('strategy-name', 'dip');
      type('strategy-trigger', '100');
      type('strategy-quantity', '50');
      (el('strategy-save') as HTMLButtonElement).click();
      await settle();
      expect(createStrategy).not.toHaveBeenCalled();
      expect(text('strategy-form-hint')).toContain('max spend and a max position');
    });

    it('shows the live price under the target price and what the level means now', async () => {
      await pick('AAPL', 'aap');
      expect(quote).toHaveBeenCalledWith('AAPL');
      expect(text('strategy-current-price')).toContain('ask 99.90');
      expect(text('strategy-current-price')).toContain('bid 99.80');

      type('strategy-trigger', '100');
      await settle();
      expect(text('strategy-preview')).toContain('would act as soon as you enable it');

      type('strategy-trigger', '95');
      await settle();
      expect(text('strategy-preview')).toContain('wait until the ask falls to 95.00');
    });

    it('creates a buy with its caps, upper-casing the symbol', async () => {
      type('strategy-name', ' dip ');
      await pick('AAPL', 'aap');
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

    it('explains every field with an info note', () => {
      expect(
        fixture.nativeElement.querySelectorAll('form app-info-tip').length,
      ).toBeGreaterThanOrEqual(10);
    });
  });

  describe('selling needs stock', () => {
    it('offers no sell when the customer holds nothing', async () => {
      await setup([]);
      await openForm();
      expect((el('strategy-side-sell') as HTMLOptionElement).disabled).toBe(true);
      expect(text('strategy-side-sell')).toContain('you hold no stock');
      expect(text('strategy-no-stock')).toContain('once you hold some stock');
    });

    it('offers only held symbols for a sell, says how many are held, and blocks selling more', async () => {
      await setup([{ symbol: 'MSFT', quantity: 20 }]);
      await openForm();
      expect((el('strategy-side-sell') as HTMLOptionElement).disabled).toBe(false);

      type('strategy-side', 'SELL');
      await settle();
      const input = el('strategy-symbol') as HTMLInputElement;
      input.dispatchEvent(new Event('focus'));
      fixture.detectChanges();
      expect(options()).toEqual(['MSFT']);

      await pick('MSFT');
      expect(text('strategy-held')).toBe('You hold 20 MSFT.');

      type('strategy-name', 'exit');
      type('strategy-trigger', '120');
      type('strategy-quantity', '30');
      (el('strategy-save') as HTMLButtonElement).click();
      await settle();
      expect(createStrategy).not.toHaveBeenCalled();
      expect(text('strategy-form-error')).toContain('You hold 20 MSFT, so you cannot sell 30');

      type('strategy-quantity', '10');
      (el('strategy-save') as HTMLButtonElement).click();
      await settle();
      expect(createStrategy).toHaveBeenCalledWith(
        expect.objectContaining({ side: 'SELL', symbol: 'MSFT', quantity: 10, maxSpend: null }),
      );
    });
  });
});
