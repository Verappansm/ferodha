import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-instrument-details',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './instrument-details.component.html',
  styleUrls: ['./instrument-details.component.css'],
})
export class InstrumentDetailsComponent {
  instrumentId = signal('');
  symbol = signal('');
  name = signal('');
  price = signal(0);
  change = signal(0);
  description = signal('');
  isLoading = signal(false);
}
