import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  BankFundsResponse,
  BankTransaction,
  BankTransferType,
  TradeApi,
} from '../../api/trade-api';
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

const TRANSACTION_LABELS: Record<string, string> = {
  DEPOSIT: 'Deposit from bank',
  WITHDRAWAL: 'Withdrawal to bank',
  BUY_SETTLEMENT: 'Buy settled',
  SELL_SETTLEMENT: 'Sell settled',
  DIVIDEND: 'Dividend',
};

const OUTCOME_UNKNOWN =
  'We could not confirm whether the transfer went through. Check your balances, or press the button again: retrying this same transfer can never move the money twice.';

/**
 * Bank page (LEAP-019): both balances, and moving money between the linked
 * bank account and the trading account.
 */
@Component({
  selector: 'app-bank',
  imports: [DatePipe, FormsModule, MoneyPipe],
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

  /** The linked account number with all but the last four characters hidden. */
  readonly maskedAccount = computed(() => {
    const number = this.funds()?.bankAccountNumber ?? '';
    return number.length > 4 ? `•••• ${number.slice(-4)}` : number;
  });

  /**
   * The idempotency key of the transfer on the form. Kept until the platform
   * gives a definite answer, so pressing the button again after a network
   * failure re-sends the same key and can never move the money twice.
   * Changing the direction or the amount makes it a different transfer.
   */
  private pendingKey: string | null = null;

  /** LEAP-019: every cash movement on the account, newest first. */
  readonly transactions = signal<BankTransaction[] | null>(null);
  readonly transactionsError = signal('');

  ngOnInit(): void {
    void this.loadFunds();
    void this.loadTransactions();
  }

  async loadTransactions(): Promise<void> {
    const accountId = this.session.accountId();
    if (accountId == null) return;
    this.transactionsError.set('');
    try {
      const page = await firstValueFrom(this.api.bankTransactions(accountId, 50, 0));
      this.transactions.set(page.transactions);
    } catch (error) {
      this.transactionsError.set(errorMessage(error));
    }
  }

  /** Money into the trading account reads +, money out −, with the word beside it. */
  isInflow(type: string): boolean {
    return type === 'DEPOSIT' || type === 'SELL_SETTLEMENT' || type === 'DIVIDEND';
  }

  transactionLabel(type: string): string {
    return TRANSACTION_LABELS[type] ?? type;
  }

  setType(type: BankTransferType): void {
    if (type === this.transactionType()) return;
    this.transactionType.set(type);
    this.pendingKey = null;
    this.success.set('');
    this.error.set('');
  }

  setAmount(value: number | string | null): void {
    this.amount.set(value === '' || value === null ? null : +value);
    this.pendingKey = null;
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
    if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) {
      this.error.set('The amount can have at most 2 decimal places.');
      return;
    }
    const idempotencyKey = (this.pendingKey ??= crypto.randomUUID());
    this.isSubmitting.set(true);
    try {
      const result = await firstValueFrom(
        this.api.bankTransfer(accountId, this.transactionType(), {
          amount: Math.round(amount * 100) / 100,
          pinHash: bcrypt.hashSync(pin, PIN_PROOF_SALT),
          idempotencyKey,
        }),
      );
      this.pendingKey = null;
      this.funds.set(result);
      void this.loadTransactions();
      this.pin.set('');
      this.amount.set(null);
      this.success.set(
        this.transactionType() === 'DEPOSIT'
          ? 'Deposit completed. Your trading balance has been updated.'
          : 'Withdrawal completed. Your bank balance has been updated.',
      );
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 0) {
        // No answer: keep the key so a retry is this same transfer.
        this.error.set(OUTCOME_UNKNOWN);
      } else {
        this.pendingKey = null;
        this.error.set(errorMessage(error));
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
