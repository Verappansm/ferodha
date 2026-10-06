import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { firstValueFrom, interval } from 'rxjs';
import {
  CreateStrategyRequest,
  StrategyEventResponse,
  StrategyResponse,
  TradeApi,
} from '../../api/trade-api';
import { errorMessage } from '../../core/errors/error-message';

/** How often the list is re-read: a strategy changes state while nobody is watching. */
export const REFRESH_MS = 10_000;

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
 * the order when the price crosses it, with nobody confirming. A new strategy
 * starts disabled; enabling it is the customer's explicit act. Each one shows
 * its limits, how many orders it has placed, and an activity log of why it
 * fired, was blocked or stopped.
 */
@Component({
  selector: 'app-strategies',
  imports: [ReactiveFormsModule, DatePipe, DecimalPipe],
  templateUrl: './strategies.component.html',
  styleUrl: './strategies.component.css',
})
export class StrategiesComponent {
  private readonly tradeApi = inject(TradeApi);

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

  readonly form = inject(NonNullableFormBuilder).group(
    {
      name: ['', [Validators.required, Validators.maxLength(60)]],
      symbol: ['', [Validators.required, Validators.maxLength(20)]],
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

  constructor() {
    void this.load();
    interval(REFRESH_MS)
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => void this.load(true));
  }

  isBuy(): boolean {
    return this.form.controls.side.value === 'BUY';
  }

  /** The rule as a sentence, so the customer reads exactly what will happen. */
  rule(s: StrategyResponse): string {
    return s.side === 'BUY'
      ? `Buy ${s.quantity} ${s.symbol} when the ask falls to ${s.triggerPrice.toFixed(2)} or below`
      : `Sell ${s.quantity} ${s.symbol} when the bid rises to ${s.triggerPrice.toFixed(2)} or above`;
  }

  openForm(): void {
    this.formError.set('');
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.form.reset();
    this.formError.set('');
  }

  async create(): Promise<void> {
    this.formError.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const buy = v.side === 'BUY';
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
      await firstValueFrom(this.tradeApi.createStrategy(request));
      this.closeForm();
      this.notice.set('Strategy created. It is disabled until you enable it.');
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

  private async loadEvents(strategyId: string): Promise<void> {
    try {
      const events = await firstValueFrom(this.tradeApi.strategyEvents(strategyId));
      if (this.expandedId() === strategyId) this.events.set(events);
    } catch {
      if (this.expandedId() === strategyId) this.events.set([]);
    }
  }
}
