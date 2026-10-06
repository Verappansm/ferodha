export * from './accounts.service';
import { AccountsService } from './accounts.service';
export * from './fees.service';
import { FeesService } from './fees.service';
export * from './instruments.service';
import { InstrumentsService } from './instruments.service';
export * from './orders.service';
import { OrdersService } from './orders.service';
export const APIS = [AccountsService, FeesService, InstrumentsService, OrdersService];
