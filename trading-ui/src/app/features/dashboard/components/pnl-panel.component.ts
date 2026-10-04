import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-pnl-panel',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './pnl-panel.component.html',
  styleUrls: ['./pnl-panel.component.css'],
})
export class PnlPanelComponent {
  @Input() accountId: number | null = null;
  @Input() loading: boolean = false;
  @Input() error: string | null = null;
  @Input() pnlData: any = null;
  @Output() retry = new EventEmitter<void>();

  navigateToPnl() {
    console.log('Navigate to P&L');
  }

  retryClick() {
    this.retry.emit();
  }
}
