import { inject, Pipe, PipeTransform } from '@angular/core';
import { PreferencesStore } from '../preferences/preferences.store';
import { formatNumber, MASKED } from './number-format';

/**
 * `{{ amount | money: '1.2-2' }}` - DecimalPipe's arguments, grouped in the
 * customer's number format. Pass 'balance' as the second argument for a
 * figure that reveals what the customer holds (cash, value, P&L), so it is
 * masked while balances are hidden. Prices and quantities are never masked.
 *
 * Impure, because the format and the mask change without the amount changing.
 */
@Pipe({ name: 'money', pure: false })
export class MoneyPipe implements PipeTransform {
  private readonly preferences = inject(PreferencesStore);

  transform(
    value: number | null | undefined,
    digitsInfo?: string,
    kind?: 'balance',
  ): string | null {
    if (value == null) return null;
    if (kind === 'balance' && this.preferences.masked()) return MASKED;
    return formatNumber(value, this.preferences.numberFormat(), digitsInfo);
  }
}
