import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css'],
})
export class SettingsComponent {
  currentPassword = signal('');
  newPassword = signal('');
  confirmPassword = signal('');
  theme = signal('light');
  isSubmitting = signal(false);
  error = signal('');
  success = signal('');
  activeSessions = signal<any[]>([]);
  twoFactorEnabled = signal(false);
}
