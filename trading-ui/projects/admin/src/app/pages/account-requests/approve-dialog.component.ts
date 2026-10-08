import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AccountRequest } from '../../api/admin-api';

export interface ApprovalDetails {
  note: string;
}

/**
 * Approving opens a trading account on the bank account held under the applicant's
 * verified email, in that bank account's currency: neither is chosen here.
 */
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

          <p class="dialog-text" data-testid="approve-bank-note">
            The account settles to the bank account the bank holds under this email, and holds its
            cash in that bank account's currency, so money moves between them one for one. Neither
            is chosen or created here, and approval is refused if the email is unverified, the bank
            has none, or it is already linked.
          </p>

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

  readonly form = inject(NonNullableFormBuilder).group({
    note: ['', Validators.maxLength(500)],
  });

  private resolve: ((details: ApprovalDetails | null) => void) | null = null;

  ask(request: AccountRequest): Promise<ApprovalDetails | null> {
    this.request.set(request);
    this.form.reset({ note: '' });
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
    this.close({ note: value.note.trim() });
  }

  close(details: ApprovalDetails | null): void {
    const element = this.dialog().nativeElement;
    if (typeof element.close === 'function') element.close();
    else element.removeAttribute('open');
    this.resolve?.(details);
    this.resolve = null;
  }
}
