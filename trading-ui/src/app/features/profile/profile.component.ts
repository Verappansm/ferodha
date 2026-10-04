import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ProfileApiService } from '../../services/profile-api.service';
import { UserResponse } from '../../api/auth-api';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css'],
})
export class ProfileComponent implements OnInit {
  private readonly profileApi = inject(ProfileApiService);
  private readonly fb = inject(FormBuilder);

  form!: FormGroup;
  loading = signal(false);
  error = signal<string | null>(null);
  success = signal(false);
  userProfile = signal<UserResponse | null>(null);

  ngOnInit(): void {
    this.loadProfile();
  }

  private loadProfile(): void {
    this.loading.set(true);
    this.error.set(null);
    this.profileApi.getProfile().subscribe({
      next: (profile) => {
        this.userProfile.set(profile);
        this.initializeForm(profile);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load profile. Please try again.');
        this.loading.set(false);
      },
    });
  }

  private initializeForm(profile: UserResponse): void {
    this.form = this.fb.group({
      name: [
        { value: profile.name || '', disabled: false },
        [Validators.required, Validators.maxLength(100)],
      ],
      email: [
        { value: profile.email || '', disabled: true },
        Validators.required,
      ],
      phone: [
        { value: profile.phone || '', disabled: false },
        [Validators.maxLength(20)],
      ],
      role: [{ value: profile.role || '', disabled: true }, Validators.required],
      accountId: [
        { value: profile.accountId || '', disabled: true },
        Validators.required,
      ],
      joiningDate: [
        { value: this.formatDate(profile.joiningDate) || '', disabled: true },
        Validators.required,
      ],
    });
  }

  private formatDate(dateString?: string): string {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.success.set(false);

    const { name, phone } = this.form.getRawValue();

    this.profileApi.updateProfile({ name, phone }).subscribe({
      next: () => {
        this.success.set(true);
        this.loading.set(false);
        setTimeout(() => this.success.set(false), 3000);
      },
      error: (err) => {
        this.error.set('Failed to update profile. Please try again.');
        this.loading.set(false);
      },
    });
  }

  showError(field: string): boolean {
    const control = this.form?.get(field);
    return control ? control.invalid && control.touched : false;
  }

  getErrorMessage(field: string): string {
    const control = this.form?.get(field);
    if (!control?.errors) return '';

    if (control.errors['required']) {
      return `${field.charAt(0).toUpperCase() + field.slice(1)} is required`;
    }
    if (control.errors['maxlength']) {
      const max = control.errors['maxlength'].requiredLength;
      return `${field.charAt(0).toUpperCase() + field.slice(1)} cannot exceed ${max} characters`;
    }
    return 'Invalid input';
  }
}
