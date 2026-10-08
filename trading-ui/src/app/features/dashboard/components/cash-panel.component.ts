import { Component, input, output } from '@angular/core';
import { MoneyPipe } from '../../../core/format/money.pipe';
import { RouterLink } from '@angular/router';
import { BalanceResponse } from '../../../api/trade-api';
import { PanelState } from '../panel-state';

/** Available cash, from the balance route; links to the bank page. */
@Component({
  selector: 'app-cash-panel',
  imports: [MoneyPipe, RouterLink],
  templateUrl: './cash-panel.component.html',
  styleUrl: './panel.css',
})
export class CashPanelComponent {
  readonly state = input.required<PanelState<BalanceResponse>>();
  readonly retry = output<void>();
}
