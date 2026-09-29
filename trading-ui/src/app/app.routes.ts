import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { RegistrationComponent } from './components/registration/registration.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { PortfolioComponent } from './components/portfolio/portfolio.component';
import { InstrumentsComponent } from './components/instruments/instruments.component';
import { InstrumentDetailsComponent } from './components/instrument-details/instrument-details.component';
import { OrderingComponent } from './components/ordering/ordering.component';
import { OrdersComponent } from './components/orders/orders.component';
import { WatchlistComponent } from './components/watchlist/watchlist.component';
import { BankComponent } from './components/bank/bank.component';
import { SettingsComponent } from './components/settings/settings.component';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegistrationComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'portfolio', component: PortfolioComponent },
  { path: 'instruments', component: InstrumentsComponent },
  { path: 'instruments/:id', component: InstrumentDetailsComponent },
  { path: 'order', component: OrderingComponent },
  { path: 'orders', component: OrdersComponent },
  { path: 'watchlist', component: WatchlistComponent },
  { path: 'bank', component: BankComponent },
  { path: 'settings', component: SettingsComponent },
];
