import { Component } from '@angular/core';
import { inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Theme } from './core/theme/theme';

@Component({
  selector: 'adm-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  // Created at start-up so a saved light/dark choice applies on every page.
  private readonly theme = inject(Theme);
}
