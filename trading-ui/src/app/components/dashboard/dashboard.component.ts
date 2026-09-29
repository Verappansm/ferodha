import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent {
  username = signal('');
  accountBalance = signal(0);
  totalAssets = signal(0);
  portfolioValue = signal(0);
  isLoading = signal(false);
}
