import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AccountRequest } from '../../api/admin-api';

export interface ApprovalDetails {
  bankAccountNumber: string;
  currency: string;
  note: string;
}

export const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP'];

/** Approving opens a trading account, so it asks for the bank account it settles to. */
@Component({
  selector: 'adm-approve-dialog',
  imports: [ReactiveFormsModule],
  template: `
    <dialog #dialog class="dialog" (cancel)="close(null)" aria-labelledby="approve-title">
      @if (request(); as r) {
        <form [formGroup]="form" (ngSubmit)="confirm()" novalidate>
          <h2 id="approve-title">Approve account request</h2>
          <p class="dialog-text">
            Opens a trading account for <strong>{{ r.applicantName }}</strong> ({{
              r.applicantEmail
            }}). They can sign in and trade as soon as you confirm.
          </p>

          <div class="field">
            <label class="field-label" for="bank">Verified bank account number</label>
            <input
              id="bank"
              class="input mono"
              formControlName="bankAccountNumber"
              placeholder="BANK-100004"
              data-testid="approve-bank"
              [attr.aria-invalid]="invalid('bankAccountNumber')"
              aria-describedby="bank-error"
            />
            @if (invalid('bankAccountNumber')) {
              <p id="bank-error" class="field-error" data-testid="approve-bank-error">
                Enter the bank account number, 4 to 50 characters.
              </p>
            }
          </div>

          <div class="field">
            <label class="field-label" for="currency">Account currency</label>
            <select
              id="currency"
              class="input"
              formControlName="currency"
              data-testid="approve-currency"
            >
              @for (c of currencies; track c) {
                <option [value]="c">{{ c }}</option>
              }
            </select>
          </div>

          <div class="field">
            <label class="field-label" for="note">Note for the audit log (optional)</label>
            <textarea id="note" class="input textarea" rows="2" formControlName="note"></textarea>
          </div>

          <div class="dialog-actions">
            <button type="button" class="btn btn-secondary" (click)="close(null)">Cancel</button>
            <button type="submit" class="btn btn-primary" data-testid="approve-confirm">
              Approve and open account
            </button>
          </div>
        </form>
      }
    </dialog>
  `,
})
export class ApproveDialogComponent {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly request = signal<AccountRequest | null>(null);
  readonly currencies = CURRENCIES;

  readonly form = inject(NonNullableFormBuilder).group({
    bankAccountNumber: [
      '',
      [Validators.required, Validators.minLength(4), Validators.maxLength(50)],
    ],
    currency: ['USD', Validators.required],
    note: ['', Validators.maxLength(500)],
  });

  private resolve: ((details: ApprovalDetails | null) => void) | null = null;

  ask(request: AccountRequest): Promise<ApprovalDetails | null> {
    this.request.set(request);
    this.form.reset({ bankAccountNumber: '', currency: request.currency || 'USD', note: '' });
    const element = this.dialog().nativeElement;
    if (typeof element.showModal === 'function') element.showModal();
    else element.setAttribute('open', '');
    return new Promise((resolve) => (this.resolve = resolve));
  }

  confirm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.close({
      bankAccountNumber: value.bankAccountNumber.trim(),
      currency: value.currency,
      note: value.note.trim(),
    });
  }

  close(details: ApprovalDetails | null): void {
    const element = this.dialog().nativeElement;
    if (typeof element.close === 'function') element.close();
    else element.removeAttribute('open');
    this.resolve?.(details);
    this.resolve = null;
  }

  invalid(field: 'bankAccountNumber'): boolean {
    const control = this.form.controls[field];
    return control.invalid && control.touched;
  }
}
