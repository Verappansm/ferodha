import { Component, input, output } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PricedPosition } from '../../../api/portfolio-api';
import { pnlDirection, pnlSign, pnlWord } from '../../../core/format/pnl';
import { PanelState } from '../panel-state';

/** The largest holdings by market value, priced; links to the portfolio page. */
@Component({
  selector: 'app-top-positions-panel',
  imports: [DatePipe, DecimalPipe, RouterLink],
  templateUrl: './top-positions-panel.component.html',
  styleUrl: './panel.css',
})
export class TopPositionsPanelComponent {
  readonly state = input.required<PanelState<PricedPosition[]>>();
  readonly retry = output<void>();

  protected readonly direction = pnlDirection;
  protected readonly sign = pnlSign;
  protected readonly word = pnlWord;
  protected readonly abs = Math.abs;
}
