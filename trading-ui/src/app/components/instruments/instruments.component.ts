import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-instruments',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './instruments.component.html',
  styleUrls: ['./instruments.component.css']
})
export class InstrumentsComponent {
  searchQuery = signal('');
  instruments = signal<any[]>([]);
  isLoading = signal(false);
}
