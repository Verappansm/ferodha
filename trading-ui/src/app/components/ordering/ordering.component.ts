import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { Location } from '@angular/common';
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
  OrderReviewResponse,
} from '../../api/trade-api';
import { LIMIT_BUFFER, suggestedLimitPrice } from '../../core/format/limit-price';
import { DatePipe, DecimalPipe } from '@angular/common';
import { MoneyPipe } from '../../core/format/money.pipe';
import { errorMessage } from '../../core/errors/error-message';
import { rejectionText } from '../../core/format/rejection-reason';

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

/**
 * After placement the ticket re-reads order history on this interval, at
 * most FOLLOW_MAX_READS times, until the executor has finished the order.
 */
export const FOLLOW_INTERVAL_MS = 2000;
export const FOLLOW_MAX_READS = 8;

const OUTCOME_UNKNOWN =
  'We could not confirm whether your order was placed. Check the Orders page, or press Confirm again: retrying this same order can never place it twice.';

const REVIEW_UNAVAILABLE =
  'We could not work out what this order will cost. Go back and try again.';

/** The query parameter that gives the review step its own history entry. */
export const REVIEW_PARAM = 'review';

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
  imports: [ReactiveFormsModule, DatePipe, DecimalPipe, MoneyPipe],
  templateUrl: './ordering.component.html',
  styleUrls: ['./ordering.component.css'],
})
export class OrderingComponent {
  private readonly session = inject(Session);
  private readonly tradeApi = inject(TradeApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

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
  /** The placed order's status as the executor left it, and why if rejected. */
  readonly liveStatus = signal<string | null>(null);
  readonly rejectReason = signal<string | null>(null);
  private followTimer: ReturnType<typeof setTimeout> | undefined;

  /** The latest quote for the symbol on the ticket, shown under the price. */
  readonly quote = signal<InstrumentQuote | null>(null);
  /** The limit price the current quote and side suggest. */
  readonly suggestedPrice = computed(() => suggestedLimitPrice(this.quote(), this.side()));
  readonly bufferPercent = LIMIT_BUFFER * 100;
  private readonly side = signal<OrderSide>('BUY');
  /**
   * How the order will be filled, in the customer's terms. The executor prices
   * a fill at the live ticker (the same quote shown here): a BUY at the ask if
   * the limit is at or above it, a SELL at the bid if the limit is at or below
   * it. Either way the customer gets their price or better, never worse.
   */
  readonly fillNote = computed(() => {
    const quote = this.quote();
    if (this.side() === 'BUY') {
      const ask = quote?.ask != null ? ` ${quote.ask.toFixed(2)}` : '';
      return `A buy fills at the current ask${ask} if your price is at or above it, so you pay that ask or less, never more than your price. If the ask is above your price, the order is rejected.`;
    }
    const bid = quote?.bid != null ? ` ${quote.bid.toFixed(2)}` : '';
    return `A sell fills at the current bid${bid} if your price is at or below it, so you receive that bid or more, never less than your price. If the bid is below your price, the order is rejected.`;
  });

  // Read-only account from session
  readonly account = computed(() => this.session.accountId());

  readonly OrderSide = OrderSide; // For template access

  /** Review before submission: nothing reaches the platform until Confirm. */
  readonly step = signal<'edit' | 'review'>('edit');
  /**
   * Every figure the review shows, worked out by trade_api
   * (POST /api/v1/orders/review): the UI holds no fee rule of its own.
   */
  readonly review = signal<OrderReviewResponse | null>(null);
  readonly isLoadingReview = signal(false);
  readonly reviewError = signal('');

  /** True while the review step has a history entry of its own to go back from. */
  private reviewInHistory = false;
  /** The prefill last applied from the link, so a later URL change does not overwrite typing. */
  private lastPrefill = '';

  /**
   * The idempotency key of the order on the ticket. It is kept until the
   * platform gives a definite answer, so pressing Confirm again after a
   * network failure re-sends the same key and can never place a second
   * order. Editing the ticket makes it a different order, with a new key.
   */
  private pendingKey: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.followTimer));

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

    this.route.queryParams.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.prefillFrom(params);
      this.followReviewParam(params);
    });
  }

  /**
   * Buy/sell shortcuts pre-fill the ticket: symbol, side and, from the
   * instrument page, a suggested price. Applied only when those three change,
   * so adding or removing the review flag never overwrites what was typed.
   */
  private prefillFrom(params: Params): void {
    const key = [params['symbol'], params['side'], params['price']].join('|');
    if (key === this.lastPrefill) return;
    this.lastPrefill = key;
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
  }

  /**
   * Keeps the step in line with the URL. The browser's Back from the review
   * removes the flag, which returns to the ticket with every field kept. A
   * flag with no review behind it (a reload, or Forward) is dropped, since
   * the figures were never worked out for this visit.
   */
  private followReviewParam(params: Params): void {
    const flagged = params[REVIEW_PARAM] === '1';
    if (!flagged && this.step() === 'review' && !this.isSubmitting()) {
      this.reviewInHistory = false;
      this.showTicket();
    } else if (flagged && this.step() === 'edit') {
      void this.setReviewParam(false);
    }
  }

  private setReviewParam(on: boolean): Promise<boolean> {
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [REVIEW_PARAM]: on ? '1' : null },
      queryParamsHandling: 'merge',
      replaceUrl: !on,
    });
  }

  private showTicket(): void {
    this.step.set('edit');
    this.reviewError.set('');
  }

  /** Leaves the review, popping its history entry when it has one. */
  private leaveReview(): void {
    this.showTicket();
    if (this.reviewInHistory) {
      this.reviewInHistory = false;
      this.location.back();
    } else {
      void this.setReviewParam(false);
    }
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

  /**
   * Re-reads order history until the placed order leaves NEW, so the ticket
   * shows FILLED or REJECTED (with the reason) instead of the status it had
   * when it was accepted.
   */
  private follow(accountId: number, orderId: string, readsLeft: number): void {
    if (readsLeft === 0) return;
    this.followTimer = setTimeout(async () => {
      try {
        const history = await firstValueFrom(this.tradeApi.orderHistory(accountId));
        const order = history.find((o) => o.orderId === orderId);
        if (this.orderResult()?.orderId !== orderId) return;
        if (order && order.status !== 'NEW' && (order.status as string) !== 'PARTIALLY_FILLED') {
          this.liveStatus.set(order.status);
          this.rejectReason.set(rejectionText(order.rejectionReason));
          this.successMessage.set('');
          if (order.status === 'REJECTED') {
            this.errorMessage.set(`Order ${orderId} was rejected.`);
          } else {
            this.successMessage.set(`Order ${orderId} is ${order.status.toLowerCase()}.`);
          }
          return;
        }
      } catch {
        // A failed read just waits for the next one.
      }
      this.follow(accountId, orderId, readsLeft - 1);
    }, FOLLOW_INTERVAL_MS);
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
   * Step one: validate the ticket, then ask trade_api what it will cost. The
   * figures are worked out fresh on every review, so they are today's.
   */
  async startReview(): Promise<void> {
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
    this.review.set(null);
    this.step.set('review');
    this.reviewInHistory = true;
    void this.setReviewParam(true);

    this.isLoadingReview.set(true);
    try {
      this.review.set(
        await firstValueFrom(
          this.tradeApi.reviewOrder({
            accountId,
            symbol: symbol.trim().toUpperCase(),
            side,
            quantity: Number(quantity),
            price: Number(price),
          }),
        ),
      );
    } catch (error) {
      this.reviewError.set(
        error instanceof HttpErrorResponse && error.status === 0
          ? REVIEW_UNAVAILABLE
          : errorMessage(error),
      );
    } finally {
      this.isLoadingReview.set(false);
    }
  }

  /** Back to the ticket with every field as it was (and the same idempotency key). */
  back(): void {
    this.errorMessage.set('');
    this.leaveReview();
  }

  /** Step two: place exactly the order that was reviewed. */
  async submit(): Promise<void> {
    this.successMessage.set('');
    this.errorMessage.set('');
    this.orderResult.set(null);
    this.liveStatus.set(null);
    this.rejectReason.set(null);
    clearTimeout(this.followTimer);

    if (this.form.invalid || this.step() !== 'review' || this.review() === null) {
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
      this.liveStatus.set(response.status);
      this.successMessage.set(
        `Order ${response.orderId} placed. The trade executor is working on it; its result shows below.`,
      );
      this.follow(accountId, response.orderId, FOLLOW_MAX_READS);
      // Reset form after successful submission (this also drops the key).
      this.form.reset({ side: 'BUY' as OrderSide });
      this.quote.set(null);
      this.pendingKey = null;
      this.leaveReview();
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 0) {
        // No answer: the order may or may not exist. Stay on the review and
        // keep the key, so Confirm again re-sends this same order.
        this.errorMessage.set(OUTCOME_UNKNOWN);
      } else {
        // The platform answered, so this order is settled one way or the other.
        this.pendingKey = null;
        this.errorMessage.set(errorMessage(error, isRetry ? RETRY_MESSAGES : PLACE_ORDER_MESSAGES));
        this.leaveReview();
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
