import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-bank',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bank.component.html',
  styleUrls: ['./bank.component.css']
})
export class BankComponent {
  transactionType = signal('DEPOSIT');
  amount = signal<number | null>(null);
  bankAccount = signal('');
  isSubmitting = signal(false);
  error = signal('');
  success = signal('');
  transactions = signal<any[]>([]);
  isLoading = signal(false);
}
