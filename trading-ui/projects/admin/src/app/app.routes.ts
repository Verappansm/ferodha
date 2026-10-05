import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { ShellComponent } from './layout/shell.component';

/** Every page is lazy-loaded; everything but sign-in sits behind the admin guard. */
export const routes: Routes = [
  {
    path: 'sign-in',
    title: 'Sign in · Operations console',
    loadComponent: () => import('./pages/sign-in/sign-in.component').then((m) => m.SignInComponent),
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [adminGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      {
        path: 'overview',
        title: 'Overview · Operations console',
        loadComponent: () =>
          import('./pages/overview/overview.component').then((m) => m.OverviewComponent),
      },
      {
        path: 'account-requests',
        title: 'Account requests · Operations console',
        loadComponent: () =>
          import('./pages/account-requests/account-requests.component').then(
            (m) => m.AccountRequestsComponent,
          ),
      },
      {
        path: 'users',
        title: 'Users · Operations console',
        loadComponent: () => import('./pages/users/users.component').then((m) => m.UsersComponent),
      },
      {
        path: 'accounts',
        title: 'Accounts · Operations console',
        loadComponent: () =>
          import('./pages/accounts/accounts.component').then((m) => m.AccountsComponent),
      },
      {
        path: 'instruments',
        title: 'Instruments · Operations console',
        loadComponent: () =>
          import('./pages/instruments/instruments.component').then((m) => m.InstrumentsComponent),
      },
      {
        path: 'orders',
        title: 'All orders · Operations console',
        loadComponent: () =>
          import('./pages/orders/orders.component').then((m) => m.OrdersComponent),
      },
      {
        path: 'health',
        title: 'System health · Operations console',
        loadComponent: () =>
          import('./pages/health/health.component').then((m) => m.HealthComponent),
      },
      {
        path: 'audit',
        title: 'Audit log · Operations console',
        loadComponent: () => import('./pages/audit/audit.component').then((m) => m.AuditComponent),
      },
      {
        path: '**',
        title: 'Not found · Operations console',
        loadComponent: () =>
          import('./pages/not-found/not-found.component').then((m) => m.NotFoundComponent),
      },
    ],
  },
];
