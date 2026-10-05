import { Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { OrderHistoryEntry } from '../../../api/trade-api';
import { OrderStatusBadgeComponent } from '../../../components/order-status-badge/order-status-badge.component';
import { PanelState } from '../panel-state';

/** The latest orders, with the blotter's own status badge; links to the orders page. */
@Component({
  selector: 'app-recent-orders-panel',
  imports: [DatePipe, RouterLink, OrderStatusBadgeComponent],
  templateUrl: './recent-orders-panel.component.html',
  styleUrl: './panel.css',
})
export class RecentOrdersPanelComponent {
  readonly state = input.required<PanelState<OrderHistoryEntry[]>>();
  readonly retry = output<void>();
}
