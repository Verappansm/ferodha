import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TopPositionsPanelComponent } from './top-positions-panel.component';
import { DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';

describe('TopPositionsPanelComponent', () => {
  let component: TopPositionsPanelComponent;
  let fixture: ComponentFixture<TopPositionsPanelComponent>;
  let debugElement: DebugElement;

  const mockPositions = [
    {
      symbol: 'AAPL',
      quantity: 100,
      averageCost: 150,
      costBasis: 15000,
      currency: 'USD',
      lastPrice: 155.5,
      marketValue: 15550,
      unrealisedPnl: 550,
      stale: false,
      priceAsOf: new Date().toISOString(),
    },
    {
      symbol: 'MSFT',
      quantity: 50,
      averageCost: 300,
      costBasis: 15000,
      currency: 'USD',
      lastPrice: 300,
      marketValue: 15000,
      unrealisedPnl: 0,
      stale: true,
      priceAsOf: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      symbol: 'GOOGL',
      quantity: 25,
      averageCost: 400,
      costBasis: 10000,
      currency: 'USD',
      lastPrice: 380,
      marketValue: 9500,
      unrealisedPnl: -500,
      stale: false,
      priceAsOf: new Date().toISOString(),
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TopPositionsPanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TopPositionsPanelComponent);
    component = fixture.componentInstance;
    debugElement = fixture.debugElement;
  });

  describe('rendering', () => {
    it('should create the component', () => {
      expect(component).toBeTruthy();
    });

    it('should display panel title', () => {
      fixture.detectChanges();
      const title = debugElement.query(By.css('.panel-header h2'));
      expect(title.nativeElement.textContent).toContain('Top Positions');
    });
  });

  describe('loading state', () => {
    it('should show loading skeleton when loading is true', () => {
      component.loading = true;
      fixture.detectChanges();

      const skeleton = debugElement.query(By.css('.skeleton-rows'));
      expect(skeleton).toBeTruthy();
    });

    it('should hide table when loading', () => {
      component.loading = true;
      fixture.detectChanges();

      const table = debugElement.query(By.css('.positions-table'));
      expect(table).toBeFalsy();
    });
  });

  describe('empty state', () => {
    it('should show empty message when no positions', () => {
      component.loading = false;
      component.positions = [];
      fixture.detectChanges();

      const emptyMsg = debugElement.query(By.css('.empty-message'));
      expect(emptyMsg).toBeTruthy();
      expect(emptyMsg.nativeElement.textContent).toContain('No positions yet');
    });

    it('should not show table when empty', () => {
      component.loading = false;
      component.positions = [];
      fixture.detectChanges();

      const table = debugElement.query(By.css('.positions-table'));
      expect(table).toBeFalsy();
    });
  });

  describe('data display', () => {
    it('should display all positions in table', () => {
      component.loading = false;
      component.positions = mockPositions;
      fixture.detectChanges();

      const rows = debugElement.queryAll(By.css('.table-row'));
      expect(rows.length).toBe(mockPositions.length);
    });

    it('should display table headers', () => {
      component.loading = false;
      component.positions = mockPositions;
      fixture.detectChanges();

      const headers = debugElement.queryAll(By.css('.table-header div'));
      expect(headers.length).toBeGreaterThan(0);
    });

    it('should display position symbols', () => {
      component.loading = false;
      component.positions = mockPositions;
      fixture.detectChanges();

      const symbols = debugElement.queryAll(By.css('.symbol-text'));
      expect(symbols[0].nativeElement.textContent).toContain('AAPL');
      expect(symbols[1].nativeElement.textContent).toContain('MSFT');
      expect(symbols[2].nativeElement.textContent).toContain('GOOGL');
    });

    it('should display quantities', () => {
      component.loading = false;
      component.positions = mockPositions;
      fixture.detectChanges();

      const quantities = debugElement.queryAll(By.css('.col-quantity'));
      expect(quantities[0].nativeElement.textContent).toContain('100');
      expect(quantities[1].nativeElement.textContent).toContain('50');
      expect(quantities[2].nativeElement.textContent).toContain('25');
    });

    it('should display prices', () => {
      component.loading = false;
      component.positions = mockPositions;
      fixture.detectChanges();

      const prices = debugElement.queryAll(By.css('.col-price'));
      expect(prices[0].nativeElement.textContent).toContain('155.50');
    });

    it('should display market values', () => {
      component.loading = false;
      component.positions = mockPositions;
      fixture.detectChanges();

      const values = debugElement.queryAll(By.css('.col-value'));
      expect(values[0].nativeElement.textContent).toContain('15,550.00');
    });
  });

  describe('P&L display', () => {
    it('should display positive P&L in green', () => {
      component.loading = false;
      component.positions = [mockPositions[0]];
      fixture.detectChanges();

      const pnl = debugElement.query(By.css('.col-pnl .pnl-value'));
      expect(pnl.nativeElement.classList.contains('positive')).toBe(true);
      expect(pnl.nativeElement.textContent).toContain('550');
    });

    it('should display negative P&L in red', () => {
      component.loading = false;
      component.positions = [mockPositions[2]];
      fixture.detectChanges();

      const pnl = debugElement.query(By.css('.col-pnl .pnl-value'));
      expect(pnl.nativeElement.classList.contains('negative')).toBe(true);
      expect(pnl.nativeElement.textContent).toContain('-500');
    });

    it('should display zero P&L', () => {
      component.loading = false;
      component.positions = [mockPositions[1]];
      fixture.detectChanges();

      const pnl = debugElement.query(By.css('.col-pnl .pnl-value'));
      expect(pnl.nativeElement.textContent).toContain('0');
    });

    it('should prefix positive P&L with +', () => {
      component.loading = false;
      component.positions = [mockPositions[0]];
      fixture.detectChanges();

      const pnl = debugElement.query(By.css('.col-pnl .pnl-value'));
      expect(pnl.nativeElement.textContent).toContain('+550');
    });
  });

  describe('stale data indicator', () => {
    it('should show stale badge when price is stale', () => {
      component.loading = false;
      component.positions = [mockPositions[1]];
      fixture.detectChanges();

      const staleBadge = debugElement.query(By.css('.stale-badge'));
      expect(staleBadge).toBeTruthy();
      expect(staleBadge.nativeElement.textContent).toContain('Stale');
    });

    it('should not show stale badge for fresh data', () => {
      component.loading = false;
      component.positions = [mockPositions[0]];
      fixture.detectChanges();

      const staleBadge = debugElement.query(By.css('.stale-badge'));
      expect(staleBadge).toBeFalsy();
    });

    it('should have warning styling on stale badge', () => {
      component.loading = false;
      component.positions = [mockPositions[1]];
      fixture.detectChanges();

      const staleBadge = debugElement.query(By.css('.stale-badge'));
      expect(staleBadge.nativeElement.classList.length).toBeGreaterThan(0);
    });
  });

  describe('error state', () => {
    it('should show error message when error is set', () => {
      component.loading = false;
      component.error = 'Unable to load positions';
      fixture.detectChanges();

      const errorMsg = debugElement.query(By.css('.error-message'));
      expect(errorMsg.nativeElement.textContent).toContain('Unable to load positions');
    });

    it('should show retry button in error state', () => {
      component.loading = false;
      component.error = 'Network error';
      fixture.detectChanges();

      const retryBtn = debugElement.query(By.css('.btn-outline'));
      expect(retryBtn).toBeTruthy();
    });

    it('should emit retry event when retry button clicked', () => {
      component.loading = false;
      component.error = 'Network error';
      fixture.detectChanges();

      spyOn(component.retry, 'emit');

      const retryBtn = debugElement.query(By.css('.btn-outline'));
      retryBtn.nativeElement.click();

      expect(component.retry.emit).toHaveBeenCalled();
    });

    it('should hide table when error is shown', () => {
      component.loading = false;
      component.error = 'Network error';
      component.positions = mockPositions;
      fixture.detectChanges();

      const table = debugElement.query(By.css('.positions-table'));
      expect(table).toBeFalsy();
    });
  });

  describe('interaction', () => {
    it('should have view full portfolio button when positions exist', () => {
      component.loading = false;
      component.positions = mockPositions;
      fixture.detectChanges();

      const viewBtn = debugElement.query(By.css('.btn-secondary'));
      expect(viewBtn).toBeTruthy();
      expect(viewBtn.nativeElement.textContent).toContain('View Full Portfolio');
    });

    it('should have start trading button when no positions', () => {
      component.loading = false;
      component.positions = [];
      fixture.detectChanges();

      const startBtn = debugElement.query(By.css('.btn-primary'));
      expect(startBtn).toBeTruthy();
      expect(startBtn.nativeElement.textContent).toContain('Start Trading');
    });

    it('should have navigation button in header', () => {
      component.loading = false;
      fixture.detectChanges();

      const navBtn = debugElement.query(By.css('.btn-link'));
      expect(navBtn).toBeTruthy();
    });
  });

  describe('formatting', () => {
    it('should format quantities with decimals', () => {
      component.loading = false;
      component.positions = [
        {
          ...mockPositions[0],
          quantity: 100.55,
        },
      ];
      fixture.detectChanges();

      const quantity = debugElement.query(By.css('.col-quantity'));
      expect(quantity.nativeElement.textContent).toContain('100.55');
    });

    it('should format prices with 2 decimals', () => {
      component.loading = false;
      component.positions = [
        {
          ...mockPositions[0],
          lastPrice: 155.555,
        },
      ];
      fixture.detectChanges();

      const price = debugElement.query(By.css('.col-price'));
      expect(price.nativeElement.textContent).toContain('$155.56');
    });

    it('should format market values with commas', () => {
      component.loading = false;
      component.positions = [
        {
          ...mockPositions[0],
          marketValue: 1000000.99,
        },
      ];
      fixture.detectChanges();

      const value = debugElement.query(By.css('.col-value'));
      expect(value.nativeElement.textContent).toContain('1,000,000.99');
    });
  });

  describe('table structure', () => {
    it('should have 5 columns in header', () => {
      component.loading = false;
      component.positions = mockPositions;
      fixture.detectChanges();

      const headerCols = debugElement.queryAll(By.css('.table-header > div'));
      expect(headerCols.length).toBe(5);
    });

    it('should have matching number of columns per row', () => {
      component.loading = false;
      component.positions = mockPositions;
      fixture.detectChanges();

      const rows = debugElement.queryAll(By.css('.table-row'));
      rows.forEach((row) => {
        const cols = row.queryAll(By.css('> div'));
        expect(cols.length).toBeGreaterThanOrEqual(5);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle zero market value', () => {
      component.loading = false;
      component.positions = [
        {
          ...mockPositions[0],
          marketValue: 0,
        },
      ];
      fixture.detectChanges();

      const value = debugElement.query(By.css('.col-value'));
      expect(value.nativeElement.textContent).toContain('0.00');
    });

    it('should handle very small prices', () => {
      component.loading = false;
      component.positions = [
        {
          ...mockPositions[0],
          lastPrice: 0.01,
        },
      ];
      fixture.detectChanges();

      const price = debugElement.query(By.css('.col-price'));
      expect(price.nativeElement.textContent).toContain('$0.01');
    });

    it('should handle very large quantities', () => {
      component.loading = false;
      component.positions = [
        {
          ...mockPositions[0],
          quantity: 1000000,
        },
      ];
      fixture.detectChanges();

      const quantity = debugElement.query(By.css('.col-quantity'));
      expect(quantity.nativeElement.textContent).toContain('1000000');
    });
  });
});
