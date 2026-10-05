import { Component, ElementRef, signal, viewChild } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { inject } from '@angular/core';

export interface ReasonDialogOptions {
  title: string;
  /** What will happen, in one or two sentences the operator can check. */
  description: string;
  confirmLabel: string;
  /** Red confirm button, for actions that are hard to undo. */
  danger?: boolean;
}

export const REASON_MIN = 3;
export const REASON_MAX = 500;

/**
 * The confirmation every admin action goes through: what will happen, and a
 * required reason that is written to the audit log. `ask()` resolves with the
 * reason, or null when the operator cancels.
 */
@Component({
  selector: 'adm-reason-dialog',
  imports: [ReactiveFormsModule],
  template: `
    <dialog #dialog class="dialog" (cancel)="close(null)" aria-labelledby="reason-title">
      @if (options(); as o) {
        <form [formGroup]="form" (ngSubmit)="confirm()" novalidate>
          <h2 id="reason-title">{{ o.title }}</h2>
          <p class="dialog-text">{{ o.description }}</p>
          <label class="field-label" for="reason">Reason (recorded in the audit log)</label>
          <textarea
            id="reason"
            class="input textarea"
            rows="3"
            formControlName="reason"
            data-testid="reason-input"
            [attr.aria-invalid]="showError()"
            aria-describedby="reason-error"
          ></textarea>
          @if (showError()) {
            <p id="reason-error" class="field-error" data-testid="reason-error">
              Give a reason of {{ min }} to {{ max }} characters.
            </p>
          }
          <div class="dialog-actions">
            <button type="button" class="btn btn-secondary" (click)="close(null)">Cancel</button>
            <button
              type="submit"
              class="btn"
              [class.btn-danger]="o.danger"
              [class.btn-primary]="!o.danger"
              data-testid="reason-confirm"
            >
              {{ o.confirmLabel }}
            </button>
          </div>
        </form>
      }
    </dialog>
  `,
})
export class ReasonDialogComponent {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly options = signal<ReasonDialogOptions | null>(null);
  readonly min = REASON_MIN;
  readonly max = REASON_MAX;

  readonly form = inject(NonNullableFormBuilder).group({
    reason: [
      '',
      [Validators.required, Validators.minLength(REASON_MIN), Validators.maxLength(REASON_MAX)],
    ],
  });

  private resolve: ((reason: string | null) => void) | null = null;

  ask(options: ReasonDialogOptions): Promise<string | null> {
    this.options.set(options);
    this.form.reset();
    const element = this.dialog().nativeElement;
    // showModal is missing in some test DOMs; the open attribute is enough there.
    if (typeof element.showModal === 'function') element.showModal();
    else element.setAttribute('open', '');
    return new Promise((resolve) => (this.resolve = resolve));
  }

  confirm(): void {
    const reason = this.form.controls.reason.value.trim();
    if (this.form.invalid || reason.length < REASON_MIN) {
      this.form.markAllAsTouched();
      if (reason.length < REASON_MIN) this.form.controls.reason.setErrors({ minlength: true });
      return;
    }
    this.close(reason);
  }

  close(reason: string | null): void {
    const element = this.dialog().nativeElement;
    if (typeof element.close === 'function') element.close();
    else element.removeAttribute('open');
    this.resolve?.(reason);
    this.resolve = null;
  }

  showError(): boolean {
    const control = this.form.controls.reason;
    return control.invalid && control.touched;
  }
}
