import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  firstValueFrom,
  map,
  of,
  switchMap,
} from 'rxjs';
import { Session } from '../../core/session/session';
import {
  TradeApi,
  OrderSide,
  OrderResponse,
  InstrumentQuote,
  BalanceResponse,
} from '../../api/trade-api';
import { LIMIT_BUFFER, suggestedLimitPrice } from '../../core/format/limit-price';
import { DatePipe, DecimalPipe } from '@angular/common';
import { errorMessage } from '../../core/errors/error-message';

/** The contract's PlaceOrderRequest.symbol limit. */
export const SYMBOL_MAX_LENGTH = 20;

/**
 * The contract's symbol scheme: a plain ticker (AAPL), a `.NS` / `.BO`
 * suffix (TCS.NS), `FX:` for a currency pair, `X:` for crypto. Letters,
 * digits, dots and hyphens after an optional prefix.
 */
const SYMBOL_SHAPE = /^(?:FX:|X:)?[A-Z0-9][A-Z0-9.-]*$/i;

/** quantity is an int32 in the contract. */
const MAX_QUANTITY = 2_147_483_647;

// Placing an order meets ORD-409 for a sell larger than the holding.
const PLACE_ORDER_MESSAGES = {
  'ORD-409':
    'You do not hold enough units to sell that quantity. Check your holdings, then try again.',
};

// A retry reuses the first attempt's idempotency key, so ORD-409 on a retry
// means the first attempt did reach the platform and the order exists.
const RETRY_MESSAGES = {
  'ORD-409':
    'This order was already placed by your earlier attempt. Check the Orders page for its status instead of placing it again.',
};

const OUTCOME_UNKNOWN =
  'We could not confirm whether your order was placed. Check the Orders page, or press Confirm again: retrying this same order can never place it twice.';

const FEE_UNAVAILABLE =
  'We could not load the fee schedule, so we cannot show what this order will cost. Go back and try again.';

/** The order as it was when the customer pressed Review. */
export interface ReviewedOrder {
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
}

export interface OrderEstimate {
  /** quantity x limit price. */
  cost: number;
  /** cost x the published fee rate. */
  fee: number;
  /** What a BUY pays (cost + fee) or a SELL receives (cost - fee). */
  total: number;
}

/**
 * The executor's rule, applied to the limit price: fee = value x rate, added
 * to a BUY's debit and taken from a SELL's credit. The rate comes from
 * GET /api/v1/fees, never from a copy here.
 */
export function orderEstimate(
  side: OrderSide,
  quantity: number,
  price: number,
  rate: number,
): OrderEstimate {
  const cost = quantity * price;
  const fee = cost * rate;
  return { cost, fee, total: side === 'BUY' ? cost + fee : cost - fee };
}

function quantityValidator(control: AbstractControl): ValidationErrors | null {
  const value: unknown = control.value;
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isInteger(num)) return { notWhole: true };
  if (num <= 0) return { notPositive: true };
  if (num > MAX_QUANTITY) return { tooLarge: true };
  return null;
}

function priceValidator(control: AbstractControl): ValidationErrors | null {
  const value: unknown = control.value;
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return { notANumber: true };
  if (num <= 0) return { notPositive: true };
  // Checked arithmetically, not on the text: 0.0000001 prints as "1e-7",
  // which has no "." and would pass a check that counts digits after one.
  const cents = num * 100;
  if (Math.abs(cents - Math.round(cents)) > 1e-6) return { tooManyDecimals: true };
  return null;
}

@Component({
  selector: 'app-ordering',
  imports: [ReactiveFormsModule, DatePipe, DecimalPipe],
  templateUrl: './ordering.component.html',
  styleUrls: ['./ordering.component.css'],
})
export class OrderingComponent {
  private readonly session = inject(Session);
  private readonly tradeApi = inject(TradeApi);
  private readonly route = inject(ActivatedRoute);

  readonly form = inject(NonNullableFormBuilder).group({
    symbol: [
      '',
      [
        Validators.required,
        Validators.maxLength(SYMBOL_MAX_LENGTH),
        Validators.pattern(SYMBOL_SHAPE),
      ],
    ],
    side: ['BUY' as OrderSide, Validators.required],
    quantity: [null as number | null, [Validators.required, quantityValidator]],
    price: [null as number | null, [Validators.required, priceValidator]],
  });

  readonly isSubmitting = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly orderResult = signal<OrderResponse | null>(null);

  /** The latest quote for the symbol on the ticket, shown under the price. */
  readonly quote = signal<InstrumentQuote | null>(null);
  /** The limit price the current quote and side suggest. */
  readonly suggestedPrice = computed(() => suggestedLimitPrice(this.quote(), this.side()));
  readonly bufferPercent = LIMIT_BUFFER * 100;
  private readonly side = signal<OrderSide>('BUY');

  // Read-only account from session
  readonly account = computed(() => this.session.accountId());

  readonly OrderSide = OrderSide; // For template access

  /** Review before submission: nothing reaches the platform until Confirm. */
  readonly step = signal<'edit' | 'review'>('edit');
  readonly reviewed = signal<ReviewedOrder | null>(null);
  readonly feeRate = signal<number | null>(null);
  readonly balance = signal<BalanceResponse | null>(null);
  readonly isLoadingReview = signal(false);
  readonly reviewError = signal('');

  readonly estimate = computed(() => {
    const order = this.reviewed();
    const rate = this.feeRate();
    if (!order || rate === null) return null;
    return orderEstimate(order.side, order.quantity, order.price, rate);
  });

  /** The instrument's currency, when the quote names one. */
  readonly priceCurrency = computed(() => this.quote()?.currency ?? null);

  /**
   * Cash left after a BUY. Shown only when the balance and the price are in
   * the same currency: otherwise the executor converts at settlement, and a
   * subtraction across currencies would be wrong.
   */
  readonly cashRemaining = computed(() => {
    const order = this.reviewed();
    const estimate = this.estimate();
    const balance = this.balance();
    if (!order || order.side !== 'BUY' || !estimate || !balance) return null;
    const currency = this.priceCurrency();
    if (currency && currency !== balance.currency) return null;
    return balance.cashBalance - estimate.total;
  });

  /**
   * The idempotency key of the order on the ticket. It is kept until the
   * platform gives a definite answer, so pressing Confirm again after a
   * network failure re-sends the same key and can never place a second
   * order. Editing the ticket makes it a different order, with a new key.
   */
  private pendingKey: string | null = null;

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.pendingKey = null;
    });

    this.form.controls.side.valueChanges.pipe(takeUntilDestroyed()).subscribe((side) => {
      this.side.set(side);
      this.fillSuggestedPrice();
    });

    // The quote for whatever symbol is on the ticket, re-read when it changes.
    this.form.controls.symbol.valueChanges
      .pipe(
        map((symbol) => symbol.trim().toUpperCase()),
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((symbol) =>
          this.form.controls.symbol.valid
            ? this.tradeApi.quote(symbol).pipe(catchError(() => of(null)))
            : of(null),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((quote) => {
        this.quote.set(quote);
        this.fillSuggestedPrice();
      });

    // Buy/sell shortcuts pre-fill the ticket: symbol, side and, from the
    // instrument page, a suggested price. Nothing is sent until Confirm.
    this.route.queryParams.pipe(takeUntilDestroyed()).subscribe((params) => {
      if (params['side'] === 'BUY' || params['side'] === 'SELL') {
        this.form.controls.side.setValue(params['side']);
      }
      if (params['symbol']) {
        this.form.controls.symbol.setValue(params['symbol']);
      }
      const price = Number(params['price']);
      if (params['price'] && Number.isFinite(price) && price > 0) {
        this.form.controls.price.setValue(Math.round(price * 100) / 100);
      }
    });
  }

  /**
   * Fills the price with the suggestion, unless the customer has typed a
   * price of their own (a dirty control): their number always wins.
   */
  private fillSuggestedPrice(): void {
    const suggested = this.suggestedPrice();
    if (suggested !== null && !this.form.controls.price.dirty) {
      this.form.controls.price.setValue(suggested);
    }
  }

  useSuggestedPrice(): void {
    const suggested = this.suggestedPrice();
    if (suggested === null) return;
    this.form.controls.price.setValue(suggested);
    this.form.controls.price.markAsPristine();
  }

  quantityError(): string | null {
    const control = this.form.controls.quantity;
    if (control.hasError('required')) return 'Enter a quantity';
    if (control.hasError('notWhole')) return 'Quantity must be a whole number';
    if (control.hasError('notPositive')) return 'Quantity must be greater than zero';
    if (control.hasError('tooLarge')) return 'Quantity is too large';
    return null;
  }

  priceError(): string | null {
    const control = this.form.controls.price;
    if (control.hasError('required')) return 'Enter a price';
    if (control.hasError('notANumber')) return 'Enter the price as a number';
    if (control.hasError('notPositive')) return 'Price must be greater than zero';
    if (control.hasError('tooManyDecimals')) return 'Price can have at most 2 decimal places';
    return null;
  }

  symbolError(): string | null {
    const control = this.form.controls.symbol;
    if (control.hasError('required')) return 'Enter a symbol';
    if (control.hasError('maxlength')) return `A symbol is at most ${SYMBOL_MAX_LENGTH} characters`;
    if (control.hasError('pattern'))
      return 'Enter a symbol such as AAPL, TCS.NS, FX:EURUSD or X:BTCUSD';
    return null;
  }

  /**
   * Step one: validate the ticket and show every figure. The fee rate and
   * balance are read fresh each time, so the review shows today's numbers.
   */
  async review(): Promise<void> {
    this.successMessage.set('');
    this.errorMessage.set('');
    this.orderResult.set(null);
    this.reviewError.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const accountId = this.account();
    if (!accountId) {
      this.errorMessage.set('You must be signed in to place an order');
      return;
    }

    const { symbol, side, quantity, price } = this.form.getRawValue();
    this.reviewed.set({
      symbol: symbol.trim().toUpperCase(),
      side,
      quantity: Number(quantity),
      price: Number(price),
    });
    this.feeRate.set(null);
    this.balance.set(null);
    this.step.set('review');

    this.isLoadingReview.set(true);
    try {
      const [fees, balance] = await Promise.all([
        firstValueFrom(this.tradeApi.feeSchedule()).catch(() => null),
        // The cash line is a convenience: the review still works without it.
        firstValueFrom(this.tradeApi.balance(accountId)).catch(() => null),
      ]);
      if (fees) {
        this.feeRate.set(fees.rate);
      } else {
        this.reviewError.set(FEE_UNAVAILABLE);
      }
      this.balance.set(balance);
    } finally {
      this.isLoadingReview.set(false);
    }
  }

  /** Back to the ticket with every field as it was (and the same idempotency key). */
  back(): void {
    this.step.set('edit');
    this.reviewError.set('');
    this.errorMessage.set('');
  }

  /** Step two: place exactly the order that was reviewed. */
  async submit(): Promise<void> {
    this.successMessage.set('');
    this.errorMessage.set('');
    this.orderResult.set(null);

    if (this.form.invalid || this.step() !== 'review' || this.feeRate() === null) {
      return;
    }

    const accountId = this.account();
    if (!accountId) {
      this.errorMessage.set('You must be signed in to place an order');
      return;
    }

    const isRetry = this.pendingKey !== null;
    const idempotencyKey = (this.pendingKey ??= crypto.randomUUID());
    const { symbol, side, quantity, price } = this.form.getRawValue();

    this.isSubmitting.set(true);
    try {
      // After validation passes, quantity and price are guaranteed to be numbers
      const response = await firstValueFrom(
        this.tradeApi.placeOrder({
          accountId,
          symbol: symbol.trim().toUpperCase(),
          side,
          quantity: Number(quantity),
          price: Number(price),
          idempotencyKey,
        }),
      );

      this.orderResult.set(response);
      this.successMessage.set(
        `Order ${response.orderId} placed successfully with status ${response.status}`,
      );
      // Reset form after successful submission (this also drops the key).
      this.form.reset({ side: 'BUY' as OrderSide });
      this.quote.set(null);
      this.pendingKey = null;
      this.step.set('edit');
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 0) {
        // No answer: the order may or may not exist. Stay on the review and
        // keep the key, so Confirm again re-sends this same order.
        this.errorMessage.set(OUTCOME_UNKNOWN);
      } else {
        // The platform answered, so this order is settled one way or the other.
        this.pendingKey = null;
        this.errorMessage.set(errorMessage(error, isRetry ? RETRY_MESSAGES : PLACE_ORDER_MESSAGES));
        this.step.set('edit');
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
