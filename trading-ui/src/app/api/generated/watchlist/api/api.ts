export * from './price-alerts.service';
import { PriceAlertsService } from './price-alerts.service';
export * from './watchlists.service';
import { WatchlistsService } from './watchlists.service';
export const APIS = [PriceAlertsService, WatchlistsService];
