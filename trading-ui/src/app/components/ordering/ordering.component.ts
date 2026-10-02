import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Session } from '../../core/session/session';
import { TradeApi, OrderSide, OrderResponse } from '../../api/trade-api';
import { errorMessage } from '../../core/errors/error-message';

/** Generates a UUID v4 for idempotency keys. */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Placing an order meets ORD-409 for a sell larger than the holding. A reused
// idempotency key cannot happen here, because every submit draws a new one.
const PLACE_ORDER_MESSAGES = {
  'ORD-409':
    'You do not hold enough units to sell that quantity. Check your holdings, then try again.',
};

@Component({
  selector: 'app-ordering',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './ordering.component.html',
  styleUrls: ['./ordering.component.css'],
})
export class OrderingComponent {
  private readonly session = inject(Session);
  private readonly tradeApi = inject(TradeApi);

  readonly form = inject(NonNullableFormBuilder).group({
    symbol: ['', [Validators.required, Validators.minLength(1)]],
    side: ['BUY' as OrderSide, Validators.required],
    quantity: [null as number | null, [Validators.required, this.validateQuantity.bind(this)]],
    price: [null as number | null, [Validators.required, this.validatePrice.bind(this)]],
  });

  readonly isSubmitting = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly orderResult = signal<OrderResponse | null>(null);

  // Read-only account from session
  readonly account = computed(() => this.session.accountId());

  readonly OrderSide = OrderSide; // For template access

  private validateQuantity(control: any): { [key: string]: any } | null {
    const value = control.value;
    if (value === null || value === undefined || value === '') return null;

    const num = Number(value);
    // Check if it's a whole number
    if (!Number.isInteger(num)) {
      return { notWhole: true };
    }
    // Check if it's greater than zero
    if (num <= 0) {
      return { notPositive: true };
    }
    return null;
  }

  private validatePrice(control: any): { [key: string]: any } | null {
    const value = control.value;
    if (value === null || value === undefined || value === '') return null;

    const num = Number(value);
    // Check if it's greater than zero
    if (num <= 0) {
      return { notPositive: true };
    }
    // Check if it has at most 2 decimal places
    const decimalPlaces = (value.toString().split('.')[1] || '').length;
    if (decimalPlaces > 2) {
      return { tooManyDecimals: true };
    }
    return null;
  }

  quantityError(): string | null {
    const control = this.form.controls.quantity;
    if (control.hasError('required')) return 'Enter a quantity';
    if (control.hasError('notWhole')) return 'Quantity must be a whole number';
    if (control.hasError('notPositive')) return 'Quantity must be greater than zero';
    return null;
  }

  priceError(): string | null {
    const control = this.form.controls.price;
    if (control.hasError('required')) return 'Enter a price';
    if (control.hasError('notPositive')) return 'Price must be greater than zero';
    if (control.hasError('tooManyDecimals')) return 'Price can have at most 2 decimal places';
    return null;
  }

  symbolError(): string | null {
    const control = this.form.controls.symbol;
    if (control.hasError('required')) return 'Enter a symbol';
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

    this.isSubmitting.set(true);
    try {
      const accountId = this.account();
      if (!accountId) {
        this.errorMessage.set('You must be signed in to place an order');
        return;
      }

      const { symbol, side, quantity, price } = this.form.getRawValue();

      // After validation passes, quantity and price are guaranteed to be numbers
      const response = await firstValueFrom(
        this.tradeApi.placeOrder({
          accountId,
          symbol,
          side,
          quantity: quantity as number,
          price: price as number,
          idempotencyKey: generateUUID(),
        }),
      );

      this.orderResult.set(response);
      this.successMessage.set(
        `Order ${response.orderId} placed successfully with status ${response.status}`,
      );
      // Reset form after successful submission
      this.form.reset({ side: 'BUY' as OrderSide });
    } catch (error) {
      this.errorMessage.set(errorMessage(error, PLACE_ORDER_MESSAGES));
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
