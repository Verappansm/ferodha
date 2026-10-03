import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** An unknown console address: say so, never render an empty page. */
@Component({
  selector: 'adm-not-found',
  imports: [RouterLink],
  template: `
    <div class="page">
      <section class="card card-body">
        <h1>Page not found</h1>
        <p class="muted">There is no console page at this address. It may have moved.</p>
        <a class="btn btn-primary" routerLink="/overview">Go to the overview</a>
      </section>
    </div>
  `,
})
export class NotFoundComponent {}
