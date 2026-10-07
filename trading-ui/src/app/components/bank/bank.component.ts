import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { BankFundsResponse, BankTransferType, TradeApi } from '../../api/trade-api';
import { MoneyPipe } from '../../core/format/money.pipe';
import { Session } from '../../core/session/session';
import { errorMessage } from '../../core/errors/error-message';
import bcrypt from 'bcryptjs';

/**
 * The fixed salt of the PIN proof: the browser sends bcrypt(PIN, salt), never the
 * PIN. A bcrypt salt is exactly 22 characters after "$2b$12$"; one short and
 * bcryptjs throws "Illegal salt length" before any request is sent.
 */
export const PIN_PROOF_SALT = '$2b$12$D6aOfmGWG4oQpLdkJ0PV.e';

@Component({
  selector: 'app-bank',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyPipe],
  templateUrl: './bank.component.html',
  styleUrls: ['./bank.component.css'],
})
export class BankComponent implements OnInit {
  private readonly api = inject(TradeApi);
  private readonly session = inject(Session);

  transactionType = signal<BankTransferType>('DEPOSIT');
  amount = signal<number | null>(null);
  pin = signal('');
  isSubmitting = signal(false);
  error = signal('');
  success = signal('');
  isLoading = signal(false);
  funds = signal<BankFundsResponse | null>(null);

  ngOnInit(): void {
    void this.loadFunds();
  }

  async loadFunds(): Promise<void> {
    const accountId = this.session.accountId();
    if (accountId == null) return;
    this.isLoading.set(true);
    this.error.set('');
    try {
      this.funds.set(await firstValueFrom(this.api.bankFunds(accountId)));
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.isLoading.set(false);
    }
  }

  async submit(): Promise<void> {
    const accountId = this.session.accountId();
    const amount = this.amount();
    const pin = this.pin();
    this.error.set('');
    this.success.set('');
    if (accountId == null || amount == null || !Number.isFinite(amount) || amount <= 0 || !pin) {
      this.error.set('Enter a positive amount and your bank PIN.');
      return;
    }
    this.isSubmitting.set(true);
    try {
      const result = await firstValueFrom(
        this.api.bankTransfer(accountId, this.transactionType(), {
          amount: Number(amount.toFixed(4)),
          pinHash: bcrypt.hashSync(pin, PIN_PROOF_SALT),
          idempotencyKey: crypto.randomUUID(),
        }),
      );
      this.funds.set(result);
      this.pin.set('');
      this.success.set(
        this.transactionType() === 'DEPOSIT'
          ? 'Deposit completed. Your trading balance has been updated.'
          : 'Withdrawal completed. Your bank balance has been updated.',
      );
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
