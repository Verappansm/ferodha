import { Routes } from '@angular/router';
import {
  SettingsComponent,
  unsavedPreferencesGuard,
} from './components/settings/settings.component';
import { authGuard } from './core/guards/auth.guard';

// Every feature screen is lazy-loaded (LEAP-025), so the first page a visitor sees
// downloads only what it needs. Anything no route matches ends at the not-found
// page, never at a blank screen.
export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  {
    path: 'login',
    title: 'Sign in · Ferodha',
    loadComponent: () => import('./components/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    title: 'Create account · Ferodha',
    loadComponent: () =>
      import('./components/registration/registration.component').then(
        (m) => m.RegistrationComponent,
      ),
  },
  {
    // LEAP-012: where a registration stands, for someone who cannot sign in yet.
    path: 'account-status',
    title: 'Account request · Ferodha',
    loadComponent: () =>
      import('./components/account-status/account-status.component').then(
        (m) => m.AccountStatusComponent,
      ),
  },
  {
    path: 'help',
    title: 'Help · Ferodha',
    loadComponent: () => import('./components/help/help.component').then((m) => m.HelpComponent),
  },
  {
    path: 'forbidden',
    title: 'Not allowed · Ferodha',
    loadComponent: () =>
      import('./components/status-pages/status-pages.component').then((m) => m.ForbiddenComponent),
  },
  {
    path: 'error',
    title: 'Something went wrong · Ferodha',
    loadComponent: () =>
      import('./components/status-pages/status-pages.component').then((m) => m.ErrorPageComponent),
  },
  {
    path: 'dashboard',
    title: 'Dashboard · Ferodha',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
    canActivate: [authGuard],
  },
  {
    path: 'profile',
    title: 'Profile · Ferodha',
    loadComponent: () =>
      import('./features/profile/profile.component').then((m) => m.ProfileComponent),
    canActivate: [authGuard],
  },
  {
    path: 'portfolio',
    title: 'Portfolio · Ferodha',
    loadComponent: () =>
      import('./components/portfolio/portfolio.component').then((m) => m.PortfolioComponent),
    canActivate: [authGuard],
  },
  {
    path: 'instruments',
    title: 'Markets · Ferodha',
    loadComponent: () =>
      import('./components/instruments/instruments.component').then((m) => m.InstrumentsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'instruments/:symbol',
    title: 'Instrument · Ferodha',
    // chart.js only downloads when an instrument page is opened.
    loadComponent: () =>
      import('./components/instrument-details/instrument-details.component').then(
        (m) => m.InstrumentDetailsComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'order',
    title: 'Place an order · Ferodha',
    loadComponent: () =>
      import('./components/ordering/ordering.component').then((m) => m.OrderingComponent),
    canActivate: [authGuard],
  },
  {
    path: 'orders',
    title: 'Orders · Ferodha',
    loadComponent: () =>
      import('./components/orders/orders.component').then((m) => m.OrdersComponent),
    canActivate: [authGuard],
  },
  {
    path: 'watchlist',
    title: 'Watchlist · Ferodha',
    // ag-grid is large, and only this screen uses it.
    loadComponent: () =>
      import('./components/watchlist/watchlist.component').then((m) => m.WatchlistComponent),
    canActivate: [authGuard],
  },
  {
    path: 'strategies',
    title: 'Strategies · Ferodha',
    loadComponent: () =>
      import('./components/strategies/strategies.component').then((m) => m.StrategiesComponent),
    canActivate: [authGuard],
  },
  {
    path: 'notifications',
    title: 'Notifications · Ferodha',
    loadComponent: () =>
      import('./components/notifications/notifications.component').then(
        (m) => m.NotificationsComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'bank',
    title: 'Bank · Ferodha',
    loadComponent: () => import('./components/bank/bank.component').then((m) => m.BankComponent),
    canActivate: [authGuard],
  },
  {
    path: 'settings',
    title: 'Settings · Ferodha',
    component: SettingsComponent,
    canActivate: [authGuard],
    canDeactivate: [unsavedPreferencesGuard],
  },
  {
    path: '**',
    title: 'Page not found · Ferodha',
    loadComponent: () =>
      import('./components/status-pages/status-pages.component').then((m) => m.NotFoundComponent),
  },
];
