export * from './accounts.service';
import { AccountsService } from './accounts.service';
export * from './candles.service';
import { CandlesService } from './candles.service';
export * from './instruments.service';
import { InstrumentsService } from './instruments.service';
export * from './orders.service';
import { OrdersService } from './orders.service';
export const APIS = [AccountsService, CandlesService, InstrumentsService, OrdersService];
