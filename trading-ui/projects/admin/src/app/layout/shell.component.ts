import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../api/admin-api';
import { REQUIRE_ADMIN_SIGN_IN } from '../core/guards/admin.guard';
import { AdminSession } from '../core/session/admin-session';
import { ThemeToggleComponent } from '../shared/theme-toggle.component';

interface NavItem {
  path: string;
  label: string;
  /** The `d` of a 16 x 16 outline icon. */
  icon: string;
}

/** The console's frame: sidebar navigation, top bar, and the page outlet. */
@Component({
  selector: 'adm-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ThemeToggleComponent],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.css',
})
export class ShellComponent {
  private readonly api = inject(AdminApi);
  private readonly router = inject(Router);
  protected readonly session = inject(AdminSession);
  protected readonly signInRequired = inject(REQUIRE_ADMIN_SIGN_IN);

  protected readonly operations: NavItem[] = [
    { path: '/overview', label: 'Overview', icon: 'M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z' },
    {
      path: '/account-requests',
      label: 'Account requests',
      icon: 'M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 14c0-3 2-4.5 5-4.5s5 1.5 5 4.5',
    },
    {
      path: '/users',
      label: 'Users',
      icon: 'M6 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM1.5 14c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M11.5 8.5a2 2 0 1 0 0-4M12 10c2 .3 3 1.6 3 4',
    },
    { path: '/accounts', label: 'Accounts', icon: 'M2 4.5h12v9H2zM2 7.5h12' },
  ];
  protected readonly markets: NavItem[] = [
    { path: '/instruments', label: 'Instruments', icon: 'M2 12l4-4 3 3 5-6' },
    { path: '/orders', label: 'All orders', icon: 'M3 4h10M3 8h10M3 12h6' },
    {
      path: '/fees',
      label: 'Fees',
      icon: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM8 4.5v7M6 6.5c0-1 1-1.5 2-1.5s2 .5 2 1.5-1 1.2-2 1.5-2 .5-2 1.5 1 1.5 2 1.5 2-.5 2-1.5',
    },
  ];
  protected readonly system: NavItem[] = [
    { path: '/health', label: 'System health', icon: 'M1.5 8h3l2-5 3 10 2-5h3' },
    { path: '/audit', label: 'Audit log', icon: 'M3 2h10v12H3zM5.5 6h5M5.5 9h5' },
  ];

  /** Pending account requests, shown as a badge; null until the first read answers. */
  protected readonly pending = signal<number | null>(null);

  constructor() {
    firstValueFrom(this.api.summary())
      .then((s) => this.pending.set(s.pendingRequests))
      .catch(() => this.pending.set(null));
  }

  protected signOut(): void {
    this.session.signOut();
    void this.router.navigateByUrl('/sign-in');
  }
}
