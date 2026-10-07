import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { MoneyPipe } from '../../core/format/money.pipe';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { catchError, firstValueFrom, interval, of, switchMap } from 'rxjs';
import {
  CreateStrategyRequest,
  InstrumentQuote,
  StrategyEventResponse,
  StrategyResponse,
  TradeApi,
} from '../../api/trade-api';
import { errorMessage } from '../../core/errors/error-message';
import { Session } from '../../core/session/session';
import { InfoTipComponent } from './info-tip.component';
import { SymbolOption, SymbolPickerComponent } from './symbol-picker.component';

/** How often the list is re-read: a strategy changes state while nobody is watching. */
export const REFRESH_MS = 10_000;

/** What each heading and field is, and why it is there. */
export const INFO = {
  name: 'A label for you, so you can tell your strategies apart.',
  rule: 'What the strategy does. A BUY watches the ask (the price a buyer pays) and acts when it falls to your level. A SELL watches the bid (the price a seller gets) and acts when it rises to your level.',
  limits:
    'The guard rails. A buy can never commit more than its max spend (fees included) or take your holding past its max position. A sell can only use units you actually hold.',
  watching:
    'The last price the strategy looked at and when. If this is empty, the strategy has not seen a price yet; if it is old, prices have stopped arriving.',
  orders:
    'Orders placed so far out of the most it may place. When it reaches the maximum it completes.',
  failures:
    'Problems in a row (an order that errored or was rejected). At the limit the strategy stops itself until you re-enable it, so a fault cannot keep spending.',
  status:
    'DISABLED: not running. ENABLED: watching prices. TRIPPED: stopped after too many failures. COMPLETED: placed all its orders. EXPIRED: past its expiry date.',
  actions:
    'Enable starts it, Disable stops it at once and cancels any order it has working. Activity shows what it did and why.',
  symbol: 'The instrument to trade. Only instruments that exist on the platform can be chosen.',
  action:
    'Buy when the ask falls to your level, or sell when the bid rises to it. Sell is only offered for stock you hold, because you cannot sell what you do not own.',
  trigger:
    'The price level that sets the strategy off. Like a limit order, it acts at once if the price is already at or past this level when you enable it, then again only when the price crosses it.',
  quantity: 'How many units each order buys or sells.',
  maxSpend:
    'The most this strategy may spend in total, fees included. It counts orders still working, so two quick triggers cannot overspend.',
  maxPosition:
    'The most units of this instrument you may hold, counting what you own and what is on order.',
  maxOrders: 'How many orders it may place before it completes. Use 1 for a one-off.',
  maxFailures: 'Stop automatically after this many problems in a row.',
  expires: 'Optional. After this date and time the strategy stops by itself.',
  dryRun:
    'Practice mode: the strategy logs what it would have done and places nothing, so you can check your rule first.',
} as const;

/** An ISO instant as the value a datetime-local field takes (local time, to the minute). */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * The strategy routes answer STR-404 and STR-409 with a sentence written for
 * the customer; everything else goes through the shared catalogue.
 */
export function strategyError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { errorCode?: unknown; message?: unknown } | null;
    if (typeof body?.errorCode === 'string' && body.errorCode.startsWith('STR-')) {
      return typeof body.message === 'string' ? body.message : errorMessage(error);
    }
  }
  return errorMessage(error);
}

/** A BUY must say how much it may spend and hold; a SELL needs neither. */
function buyNeedsCaps(group: AbstractControl): ValidationErrors | null {
  if (group.get('side')?.value !== 'BUY') return null;
  const spend = group.get('maxSpend')?.value;
  const position = group.get('maxPosition')?.value;
  return spend && position ? null : { capsRequired: true };
}

/**
 * Automated strategies: the customer sets a rule once and the platform places
 * the order when the price reaches it, with nobody confirming. A new strategy
 * starts disabled; enabling it is the customer's explicit act. Each one shows
 * its limits, the price it is watching, how many orders it has placed, and an
 * activity log of why it fired, was blocked or stopped.
 */
@Component({
  selector: 'app-strategies',
  imports: [ReactiveFormsModule, DatePipe, MoneyPipe, InfoTipComponent, SymbolPickerComponent],
  templateUrl: './strategies.component.html',
  styleUrl: './strategies.component.css',
})
export class StrategiesComponent {
  private readonly tradeApi = inject(TradeApi);
  private readonly session = inject(Session);
  readonly info = INFO;

  readonly strategies = signal<StrategyResponse[]>([]);
  readonly isLoading = signal(false);
  readonly hasLoaded = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly showForm = signal(false);
  readonly isSaving = signal(false);
  readonly formError = signal('');
  readonly busyId = signal<string | null>(null);
  readonly expandedId = signal<string | null>(null);
  readonly events = signal<StrategyEventResponse[]>([]);
  /** The strategy being edited, or null while a new one is being set up. */
  readonly editingId = signal<string | null>(null);

  /** How many strategies are in each state, for the strip above the cards. */
  readonly counts = computed(() => {
    const list = this.strategies();
    const n = (status: StrategyResponse['status']) =>
      list.filter((s) => s.status === status).length;
    return { running: n('ENABLED'), stopped: n('TRIPPED'), disabled: n('DISABLED') };
  });

  /** Every tradable instrument (for the symbol search) and what the customer holds. */
  readonly instruments = signal<SymbolOption[]>([]);
  readonly holdings = signal<Record<string, number>>({});
  /** The live quote of the symbol being set up, shown under the trigger price. */
  readonly quote = signal<InstrumentQuote | null>(null);

  readonly form = inject(NonNullableFormBuilder).group(
    {
      name: ['', [Validators.required, Validators.maxLength(60)]],
      symbol: ['', [Validators.required]],
      side: ['BUY' as 'BUY' | 'SELL'],
      triggerPrice: [null as number | null, [Validators.required, Validators.min(0.01)]],
      quantity: [null as number | null, [Validators.required, Validators.min(1)]],
      maxSpend: [null as number | null, [Validators.min(0.01)]],
      maxPosition: [null as number | null, [Validators.min(1)]],
      maxOrders: [1, [Validators.required, Validators.min(1), Validators.max(100)]],
      maxFailures: [3, [Validators.required, Validators.min(1), Validators.max(20)]],
      dryRun: [false],
      expiresAt: [''],
    },
    { validators: buyNeedsCaps },
  );
  /** The form's current values as a signal, so the hints below update as the customer types. */
  private readonly values = signal(this.form.getRawValue());

  readonly heldSymbols = computed(() =>
    Object.keys(this.holdings()).filter((s) => this.holdings()[s] > 0),
  );
  readonly canSell = computed(() => this.heldSymbols().length > 0);
  /** BUY can use any instrument; SELL only what is held. */
  readonly pickable = computed(() =>
    this.values().side === 'SELL'
      ? this.instruments().filter((o) => this.heldSymbols().includes(o.symbol))
      : this.instruments(),
  );
  readonly held = computed(() => this.holdings()[this.values().symbol] ?? 0);

  /** What the strategy would do right now, from the live quote and the level typed. */
  readonly preview = computed(() => {
    const q = this.quote();
    const v = this.values();
    if (!q || !v.symbol || !v.triggerPrice) return null;
    const buy = v.side === 'BUY';
    const price = buy ? q.ask : q.bid;
    if (price == null) return null;
    const met = buy ? price <= v.triggerPrice : price >= v.triggerPrice;
    return met
      ? `The ${buy ? 'ask' : 'bid'} is already ${buy ? 'at or below' : 'at or above'} this level, so it would act as soon as you enable it.`
      : `It will wait until the ${buy ? 'ask falls' : 'bid rises'} to ${v.triggerPrice.toFixed(2)}.`;
  });

  constructor() {
    void this.load();
    void this.loadInstruments();
    void this.loadHoldings();
    interval(REFRESH_MS)
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => void this.load(true));

    this.form.valueChanges
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.values.set(this.form.getRawValue()));

    // The live price of whichever symbol is chosen.
    this.form.controls.symbol.valueChanges
      .pipe(
        switchMap((symbol) =>
          symbol ? this.tradeApi.quote(symbol).pipe(catchError(() => of(null))) : of(null),
        ),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((quote) => this.quote.set(quote));

    // Moving to SELL: the symbol must be one that is held.
    this.form.controls.side.valueChanges
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((side) => {
        const symbol = this.form.controls.symbol.value;
        if (side === 'SELL' && symbol && !this.heldSymbols().includes(symbol)) {
          this.form.controls.symbol.reset('');
        }
      });
  }

  isBuy(): boolean {
    return this.values().side === 'BUY';
  }

  setSymbol(symbol: string): void {
    this.form.controls.symbol.setValue(symbol);
    this.form.controls.symbol.markAsTouched();
  }

  /** The rule as a sentence, so the customer reads exactly what will happen. */
  rule(s: StrategyResponse): string {
    return s.side === 'BUY'
      ? `Buy ${s.quantity} ${s.symbol} when the ask falls to ${s.triggerPrice.toFixed(2)} or below`
      : `Sell ${s.quantity} ${s.symbol} when the bid rises to ${s.triggerPrice.toFixed(2)} or above`;
  }

  openForm(): void {
    this.formError.set('');
    this.editingId.set(null);
    this.form.reset();
    this.showForm.set(true);
    void this.loadHoldings();
  }

  /** Only a strategy that is not running can be changed: disabled, or stopped after failures. */
  canEdit(s: StrategyResponse): boolean {
    return s.status === 'DISABLED' || s.status === 'TRIPPED';
  }

  /** Opens the form filled with a strategy's rule. Saving rewrites it (it stays disabled or stopped). */
  edit(s: StrategyResponse): void {
    if (!this.canEdit(s)) return;
    this.formError.set('');
    this.notice.set('');
    this.editingId.set(s.strategyId);
    this.form.reset({
      name: s.name,
      symbol: s.symbol,
      side: s.side,
      triggerPrice: s.triggerPrice,
      quantity: s.quantity,
      maxSpend: s.maxSpend,
      maxPosition: s.maxPosition,
      maxOrders: s.maxOrders,
      maxFailures: s.maxFailures,
      dryRun: s.dryRun,
      expiresAt: toLocalInput(s.expiresAt),
    });
    this.showForm.set(true);
    void this.loadHoldings();
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
    this.form.reset();
    this.quote.set(null);
    this.formError.set('');
  }

  /**
   * Where the price it is watching stands against the target, for the little
   * gauge on each card: both markers sit inside the bar with room either side.
   */
  gauge(
    s: StrategyResponse,
  ): { now: number; target: number; reached: boolean; text: string } | null {
    if (s.lastPrice == null) return null;
    const target = s.triggerPrice;
    const price = s.lastPrice;
    const lo = Math.min(target, price);
    const hi = Math.max(target, price);
    const pad = (hi - lo) * 0.6 || hi * 0.01;
    const min = lo - pad;
    const span = hi + pad - min;
    const gap = ((price - target) / target) * 100;
    const reached = s.side === 'BUY' ? price <= target : price >= target;
    const away = `${Math.abs(gap).toFixed(2)}% ${gap > 0 ? 'above' : 'below'} the target`;
    return {
      now: ((price - min) / span) * 100,
      target: ((target - min) / span) * 100,
      reached,
      text: reached ? `Target reached (${away})` : away,
    };
  }

  async create(): Promise<void> {
    this.formError.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const buy = v.side === 'BUY';
    if (!buy && Number(v.quantity) > this.held()) {
      this.formError.set(`You hold ${this.held()} ${v.symbol}, so you cannot sell ${v.quantity}.`);
      return;
    }
    const request: CreateStrategyRequest = {
      name: v.name.trim(),
      symbol: v.symbol.trim().toUpperCase(),
      side: v.side,
      triggerPrice: Number(v.triggerPrice),
      quantity: Number(v.quantity),
      maxSpend: buy ? Number(v.maxSpend) : null,
      maxPosition: buy ? Number(v.maxPosition) : null,
      maxOrders: v.maxOrders,
      maxFailures: v.maxFailures,
      dryRun: v.dryRun,
      expiresAt: v.expiresAt ? new Date(v.expiresAt).toISOString() : null,
    };
    this.isSaving.set(true);
    try {
      const editing = this.editingId();
      if (editing) {
        await firstValueFrom(this.tradeApi.updateStrategy(editing, request));
        this.closeForm();
        this.notice.set('Strategy updated. Enable it when you are ready.');
      } else {
        await firstValueFrom(this.tradeApi.createStrategy(request));
        this.closeForm();
        this.notice.set('Strategy created. It is disabled until you enable it.');
      }
      await this.load();
    } catch (error) {
      this.formError.set(strategyError(error));
    } finally {
      this.isSaving.set(false);
    }
  }

  async enable(s: StrategyResponse): Promise<void> {
    await this.act(s, () => this.tradeApi.enableStrategy(s.strategyId), 'Strategy enabled.');
  }

  async disable(s: StrategyResponse): Promise<void> {
    await this.act(
      s,
      () => this.tradeApi.disableStrategy(s.strategyId),
      'Strategy disabled. Its working orders were cancelled.',
    );
  }

  async toggleActivity(s: StrategyResponse): Promise<void> {
    if (this.expandedId() === s.strategyId) {
      this.expandedId.set(null);
      return;
    }
    this.expandedId.set(s.strategyId);
    await this.loadEvents(s.strategyId);
  }

  async refresh(): Promise<void> {
    await this.load();
  }

  private async act(
    s: StrategyResponse,
    call: () => ReturnType<TradeApi['enableStrategy']>,
    done: string,
  ): Promise<void> {
    if (this.busyId()) return;
    this.busyId.set(s.strategyId);
    this.error.set('');
    this.notice.set('');
    try {
      const updated = await firstValueFrom(call());
      this.strategies.update((list) =>
        list.map((item) => (item.strategyId === updated.strategyId ? updated : item)),
      );
      this.notice.set(done);
      if (this.expandedId() === s.strategyId) await this.loadEvents(s.strategyId);
    } catch (error) {
      this.error.set(strategyError(error));
    } finally {
      this.busyId.set(null);
    }
  }

  private async load(quiet = false): Promise<void> {
    if (!quiet) this.isLoading.set(true);
    try {
      this.strategies.set(await firstValueFrom(this.tradeApi.strategies()));
      this.error.set('');
      this.hasLoaded.set(true);
      const open = this.expandedId();
      if (open) await this.loadEvents(open);
    } catch (error) {
      if (!quiet) this.error.set(strategyError(error));
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadInstruments(): Promise<void> {
    try {
      const page = await firstValueFrom(this.tradeApi.getInstruments(500, 0));
      this.instruments.set(page.instruments.map((i) => ({ symbol: i.symbol, name: i.name })));
    } catch {
      // The picker stays empty; the form then cannot be completed, and the page says so.
      this.instruments.set([]);
    }
  }

  private async loadHoldings(): Promise<void> {
    const accountId = this.session.accountId();
    if (!accountId) return;
    try {
      const positions = await firstValueFrom(this.tradeApi.positions(accountId));
      this.holdings.set(Object.fromEntries(positions.map((p) => [p.symbol, p.quantity])));
    } catch {
      this.holdings.set({});
    }
  }

  private async loadEvents(strategyId: string): Promise<void> {
    try {
      const events = await firstValueFrom(this.tradeApi.strategyEvents(strategyId));
      if (this.expandedId() === strategyId) this.events.set(events);
    } catch {
      if (this.expandedId() === strategyId) this.events.set([]);
    }
  }
}
