import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-top-positions-panel',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './top-positions-panel.component.html',
  styleUrls: ['./top-positions-panel.component.css'],
})
export class TopPositionsPanelComponent {
  @Input() accountId: number | null = null;
  @Input() loading: boolean = false;
  @Input() error: string | null = null;
  @Input() positions: any[] = [];
  @Output() retry = new EventEmitter<void>();

  navigateToPositions() {
    console.log('Navigate to positions');
  }

  retryClick() {
    this.retry.emit();
  }
}
