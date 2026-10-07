import { Component, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

/**
 * Loads ag-grid's stylesheets, and only when the watchlist screen is opened.
 * They used to be imported in the global stylesheet, which put about 1 MB of
 * the grid into the first download of every page. The build emits them as a
 * separate file (angular.json: bundleName "ag-grid-theme", not injected) and
 * this adds the link the first time the watchlist is shown. The grid builds
 * its own markup, so its styles have to be global.
 */
@Component({
  selector: 'app-ag-grid-theme',
  template: '',
})
export class AgGridThemeComponent {
  constructor() {
    const doc = inject(DOCUMENT);
    if (doc.getElementById('ag-grid-theme')) return;
    const link = doc.createElement('link');
    link.id = 'ag-grid-theme';
    link.rel = 'stylesheet';
    link.href = 'ag-grid-theme.css';
    doc.head.appendChild(link);
  }
}
