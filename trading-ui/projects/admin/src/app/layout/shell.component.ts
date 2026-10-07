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
    { path: '/overview', label: 'Overview' },
    { path: '/account-requests', label: 'Account requests' },
    { path: '/users', label: 'Users' },
    { path: '/accounts', label: 'Accounts' },
  ];
  protected readonly markets: NavItem[] = [
    { path: '/instruments', label: 'Instruments' },
    { path: '/orders', label: 'All orders' },
    { path: '/fees', label: 'Fees' },
  ];
  protected readonly system: NavItem[] = [
    { path: '/health', label: 'System health' },
    { path: '/audit', label: 'Audit log' },
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
