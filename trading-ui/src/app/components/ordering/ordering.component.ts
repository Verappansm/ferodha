import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-ordering',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ordering.component.html',
  styleUrls: ['./ordering.component.css'],
})
export class OrderingComponent {
  account = signal('');
  symbol = signal('');
  quantity = signal<number | null>(null);
  price = signal<number | null>(null);
  orderType = signal('BUY');
  isSubmitting = signal(false);
  error = signal('');
  success = signal('');
  validationErrors = signal<string[]>([]);
}
