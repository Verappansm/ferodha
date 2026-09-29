import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-registration',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './registration.component.html',
  styleUrls: ['./registration.component.css'],
})
export class RegistrationComponent {
  username = signal('');
  email = signal('');
  password = signal('');
  confirmPassword = signal('');
  isLoading = signal(false);
  error = signal('');
  success = signal('');
}
