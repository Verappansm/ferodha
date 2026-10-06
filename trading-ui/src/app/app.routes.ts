import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { RegistrationComponent } from './components/registration/registration.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { ProfileComponent } from './features/profile/profile.component';
import { PortfolioComponent } from './components/portfolio/portfolio.component';
import { InstrumentsComponent } from './components/instruments/instruments.component';
import { OrderingComponent } from './components/ordering/ordering.component';
import { OrdersComponent } from './components/orders/orders.component';
import { WatchlistComponent } from './components/watchlist/watchlist.component';
import { StrategiesComponent } from './components/strategies/strategies.component';
import { BankComponent } from './components/bank/bank.component';
import { SettingsComponent } from './components/settings/settings.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegistrationComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'profile', component: ProfileComponent, canActivate: [authGuard] },
  { path: 'portfolio', component: PortfolioComponent, canActivate: [authGuard] },
  { path: 'instruments', component: InstrumentsComponent, canActivate: [authGuard] },
  // Lazy, so chart.js only downloads when an instrument page is opened.
  {
    path: 'instruments/:symbol',
    loadComponent: () =>
      import('./components/instrument-details/instrument-details.component').then(
        (m) => m.InstrumentDetailsComponent,
      ),
    canActivate: [authGuard],
  },
  { path: 'order', component: OrderingComponent, canActivate: [authGuard] },
  { path: 'orders', component: OrdersComponent, canActivate: [authGuard] },
  { path: 'watchlist', component: WatchlistComponent, canActivate: [authGuard] },
  { path: 'strategies', component: StrategiesComponent, canActivate: [authGuard] },
  { path: 'bank', component: BankComponent, canActivate: [authGuard] },
  { path: 'settings', component: SettingsComponent, canActivate: [authGuard] },
];
