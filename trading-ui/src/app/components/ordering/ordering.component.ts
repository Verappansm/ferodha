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
import { firstValueFrom } from 'rxjs';
import { Session } from '../../core/session/session';
import { TradeApi, OrderSide, OrderResponse } from '../../api/trade-api';
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
  'We could not confirm whether your order was placed. Check the Orders page, or press Place Order again: retrying this same order can never place it twice.';

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
  imports: [ReactiveFormsModule],
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

  // Read-only account from session
  readonly account = computed(() => this.session.accountId());

  readonly OrderSide = OrderSide; // For template access

  /**
   * The idempotency key of the order on the ticket. It is kept until the
   * platform gives a definite answer, so pressing Place Order again after a
   * network failure re-sends the same key and can never place a second
   * order. Editing the ticket makes it a different order, with a new key.
   */
  private pendingKey: string | null = null;

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.pendingKey = null;
    });

    // Pre-populate form from query parameters (used by buy/sell shortcuts)
    this.route.queryParams.pipe(takeUntilDestroyed()).subscribe((params) => {
      if (params['symbol']) {
        this.form.controls.symbol.setValue(params['symbol']);
      }
      if (params['side'] && (params['side'] === 'BUY' || params['side'] === 'SELL')) {
        this.form.controls.side.setValue(params['side']);
      }
    });
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

  async submit(): Promise<void> {
    // Clear previous messages
    this.successMessage.set('');
    this.errorMessage.set('');
    this.orderResult.set(null);

    // Validate form
    if (this.form.invalid) {
      this.form.markAllAsTouched();
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
      this.pendingKey = null;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 0) {
        // No answer: the order may or may not exist. Keep the key for a retry.
        this.errorMessage.set(OUTCOME_UNKNOWN);
      } else {
        // The platform answered, so this order is settled one way or the other.
        this.pendingKey = null;
        this.errorMessage.set(errorMessage(error, isRetry ? RETRY_MESSAGES : PLACE_ORDER_MESSAGES));
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
