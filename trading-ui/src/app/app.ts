import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Session } from './core/session/session';
import { Theme } from './core/theme/theme';
import { ThemeToggleComponent } from './components/theme-toggle/theme-toggle.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ThemeToggleComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly session = inject(Session);
  // Created at start-up so a saved light/dark choice applies on every page.
  private readonly theme = inject(Theme);
  private readonly router = inject(Router);

  protected signOut(): void {
    this.session.signOut();
    void this.router.navigateByUrl('/login');
  }
}
