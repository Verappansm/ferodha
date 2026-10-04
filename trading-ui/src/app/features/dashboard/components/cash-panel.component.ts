import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-cash-panel',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './cash-panel.component.html',
  styleUrls: ['./cash-panel.component.css'],
})
export class CashPanelComponent implements OnInit {
  @Input() accountId: number | null = null;
  @Input() loading: boolean = false;
  @Input() error: string | null = null;
  @Input() cashBalance: number = 0;
  @Output() retry = new EventEmitter<void>();

  ngOnInit() {
    // Component initialization
  }

  navigateToBank() {
    // Navigate to bank/deposit view
    console.log('Navigate to bank');
  }

  retryClick() {
    this.retry.emit();
  }
}
