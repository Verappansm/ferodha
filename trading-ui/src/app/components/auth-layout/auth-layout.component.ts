import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';

export type AuthTab = 'signin' | 'register';

/**
 * The frame around the sign-in and create-account forms: the brand panel and
 * the card with its two tabs. Each tab is a route (/login, /register), so the
 * browser's back button and a shared link both land on the right form, and a
 * `returnUrl` the route guard added is kept when switching tabs.
 */
@Component({
  selector: 'app-auth-layout',
  imports: [RouterLink, ThemeToggleComponent],
  templateUrl: './auth-layout.component.html',
  styleUrl: './auth-layout.component.css',
})
export class AuthLayoutComponent {
  readonly active = input.required<AuthTab>();
}
