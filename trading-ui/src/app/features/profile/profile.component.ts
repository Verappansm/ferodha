import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProfileApi, ProfileResponse } from '../../api/profile-api';
import { errorMessage } from '../../core/errors/error-message';

/**
 * The auth service's phone rule (contracts/profile-api.yaml): digits with
 * optional spaces, dashes and brackets and an optional leading +, at most 20
 * characters. Checked here so an invalid number is never sent.
 */
export const PHONE_PATTERN = /^\+?\(?[0-9][0-9 ()-]{5,18}[0-9]$/;

/**
 * The profile page (LEAP-020): the signed-in user's own details from the
 * auth service, read from their token. The name and phone can be changed;
 * the email, role, account and joining date are shown read-only.
 */
@Component({
  selector: 'app-profile',
  imports: [DatePipe, ReactiveFormsModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
})
export class ProfileComponent implements OnInit {
  private readonly profileApi = inject(ProfileApi);

  readonly profile = signal<ProfileResponse | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly isEditMode = signal(false);

  readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(100), notBlank]],
    phone: ['', [Validators.maxLength(20), Validators.pattern(PHONE_PATTERN)]],
  });

  ngOnInit(): void {
    this.profileApi.get().subscribe({
      next: (profile) => this.show(profile),
      error: (error: unknown) => this.loadError.set(errorMessage(error)),
    });
    this.form.valueChanges.subscribe(() => this.saved.set(false));
  }

  save(): void {
    this.saveError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, phone } = this.form.getRawValue();
    this.saving.set(true);
    this.profileApi.update({ name: name.trim(), phone: phone.trim() }).subscribe({
      next: (profile) => {
        this.saving.set(false);
        this.show(profile);
        this.saved.set(true);
        this.isEditMode.set(false);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.saveError.set(errorMessage(error));
      },
    });
  }

  startEdit(): void {
    this.saved.set(false);
    this.saveError.set(null);
    this.isEditMode.set(true);
  }

  /** Leaves edit mode without saving: the form goes back to the saved details. */
  cancelEdit(): void {
    const profile = this.profile();
    if (profile) this.show(profile);
    this.saveError.set(null);
    this.isEditMode.set(false);
  }

  nameError(): string | null {
    const control = this.form.controls.name;
    if (!control.touched || control.valid) return null;
    return control.hasError('maxlength')
      ? 'Name must be 100 characters or fewer.'
      : 'Enter your name.';
  }

  phoneError(): string | null {
    const control = this.form.controls.phone;
    if (!control.touched || control.valid) return null;
    return 'Enter a phone number using digits, spaces, dashes or brackets, with an optional leading +, up to 20 characters.';
  }

  private show(profile: ProfileResponse): void {
    this.profile.set(profile);
    this.form.reset({ name: profile.name, phone: profile.phone ?? '' });
  }
}

function notBlank(control: { value: string }): { blank: true } | null {
  return control.value.trim() === '' ? { blank: true } : null;
}
