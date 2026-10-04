import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-recent-orders-panel',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './recent-orders-panel.component.html',
  styleUrls: ['./recent-orders-panel.component.css'],
})
export class RecentOrdersPanelComponent {
  @Input() accountId: number | null = null;
  @Input() loading: boolean = false;
  @Input() error: string | null = null;
  @Input() orders: any[] = [];
  @Output() retry = new EventEmitter<void>();

  navigateToOrders() {
    console.log('Navigate to orders');
  }

  retryClick() {
    this.retry.emit();
  }
}
