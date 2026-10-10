import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { PLService } from './generated/portfolio/api/pl.service';
import { PortfolioService } from './generated/portfolio/api/portfolio.service';
import { PnlResponse } from './generated/portfolio/model/pnl-response';
import { PortfolioSummary } from './generated/portfolio/model/portfolio-summary';
import { PricedPosition } from './generated/portfolio/model/priced-position';

export type { PnlResponse } from './generated/portfolio/model/pnl-response';
export type { PortfolioSummary } from './generated/portfolio/model/portfolio-summary';
export type { PricedPosition } from './generated/portfolio/model/priced-position';
export type { SymbolPnl } from './generated/portfolio/model/symbol-pnl';

/** Bounds for the realised figure of `pnl`, as ISO dates (`2026-10-04`). */
export interface PnlQuery {
  from?: string;
  to?: string;
  bySymbol?: boolean;
}

/**
 * The portfolio and P&L routes as the rest of the application uses them, over
 * the client generated from contracts/portfolio-api.yaml. One plain method per call.
 */
@Injectable({ providedIn: 'root' })
export class PortfolioApi {
  private readonly portfolio = inject(PortfolioService);
  private readonly pl = inject(PLService);

  summary(accountId: number): Observable<PortfolioSummary> {
    return this.portfolio.getPortfolioSummary(accountId);
  }

  positions(accountId: number, symbol?: string): Observable<PricedPosition[]> {
    return this.portfolio.getPricedPositions(accountId, symbol);
  }

  pnl(accountId: number, query: PnlQuery = {}): Observable<PnlResponse> {
    return this.pl.getPnl(accountId, query.from, query.to, query.bySymbol);
  }
}
