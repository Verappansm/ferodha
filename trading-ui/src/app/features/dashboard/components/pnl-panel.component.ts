import { Component, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PnlResponse } from '../../../api/portfolio-api';
import { pnlDirection, pnlSign, pnlWord } from '../../../core/format/pnl';
import { PanelState } from '../panel-state';

/**
 * Today's P&L: realised P&L booked today plus unrealised P&L as at now, from
 * the same route the portfolio page reads.
 */
@Component({
  selector: 'app-pnl-panel',
  imports: [DecimalPipe, RouterLink],
  templateUrl: './pnl-panel.component.html',
  styleUrl: './panel.css',
})
export class PnlPanelComponent {
  readonly state = input.required<PanelState<PnlResponse>>();
  readonly retry = output<void>();

  protected readonly direction = pnlDirection;
  protected readonly sign = pnlSign;
  protected readonly word = pnlWord;
  protected readonly abs = Math.abs;
}
