import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PnlPanelComponent } from './pnl-panel.component';
import { DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';

describe('PnlPanelComponent', () => {
  let component: PnlPanelComponent;
  let fixture: ComponentFixture<PnlPanelComponent>;
  let debugElement: DebugElement;

  const mockPnl = {
    accountId: 123,
    baseCurrency: 'USD',
    realisedPnl: 1500,
    unrealisedPnl: 2500,
    totalPnl: 4000,
    asOf: new Date().toISOString(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PnlPanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PnlPanelComponent);
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
      expect(title.nativeElement.textContent).toContain("Today's P&L");
    });
  });

  describe('loading state', () => {
    it('should show loading skeleton when loading is true', () => {
      component.loading = true;
      fixture.detectChanges();

      const skeleton = debugElement.query(By.css('.skeleton-loader'));
      expect(skeleton).toBeTruthy();
    });

    it('should hide content when loading', () => {
      component.loading = true;
      fixture.detectChanges();

      const content = debugElement.query(By.css('.pnl-summary'));
      expect(content).toBeFalsy();
    });
  });

  describe('data display', () => {
    it('should display realised and unrealised P&L', () => {
      component.loading = false;
      component.pnl = mockPnl;
      fixture.detectChanges();

      const labels = debugElement.queryAll(By.css('.pnl-label'));
      expect(labels[0].nativeElement.textContent).toContain('Realised');
      expect(labels[1].nativeElement.textContent).toContain('Unrealised');
    });

    it('should display correct P&L values', () => {
      component.loading = false;
      component.pnl = mockPnl;
      fixture.detectChanges();

      const values = debugElement.queryAll(By.css('.pnl-value'));
      expect(values[0].nativeElement.textContent).toContain('1,500.00');
      expect(values[1].nativeElement.textContent).toContain('2,500.00');
    });

    it('should display total P&L prominently', () => {
      component.loading = false;
      component.pnl = mockPnl;
      fixture.detectChanges();

      const totalValue = debugElement.query(By.css('.total-value'));
      expect(totalValue.nativeElement.textContent).toContain('4,000.00');
    });

    it('should handle null P&L gracefully', () => {
      component.loading = false;
      component.pnl = null;
      fixture.detectChanges();

      const totalValue = debugElement.query(By.css('.total-value'));
      expect(totalValue).toBeFalsy();
    });
  });

  describe('color coding', () => {
    it('should apply positive class for positive P&L', () => {
      component.loading = false;
      component.pnl = mockPnl;
      fixture.detectChanges();

      const totalValue = debugElement.query(By.css('.total-value'));
      expect(totalValue.nativeElement.classList.contains('positive')).toBe(true);
    });

    it('should apply negative class for negative P&L', () => {
      component.loading = false;
      component.pnl = {
        ...mockPnl,
        realisedPnl: -500,
        unrealisedPnl: -1000,
        totalPnl: -1500,
      };
      fixture.detectChanges();

      const totalValue = debugElement.query(By.css('.total-value'));
      expect(totalValue.nativeElement.classList.contains('negative')).toBe(true);
    });

    it('should apply neither class for zero P&L', () => {
      component.loading = false;
      component.pnl = {
        ...mockPnl,
        realisedPnl: 0,
        unrealisedPnl: 0,
        totalPnl: 0,
      };
      fixture.detectChanges();

      const totalValue = debugElement.query(By.css('.total-value'));
      expect(totalValue.nativeElement.classList.contains('positive')).toBe(false);
      expect(totalValue.nativeElement.classList.contains('negative')).toBe(false);
    });

    it('should show positive color on each P&L item', () => {
      component.loading = false;
      component.pnl = mockPnl;
      fixture.detectChanges();

      const values = debugElement.queryAll(By.css('.pnl-value'));
      values.forEach((val) => {
        expect(val.nativeElement.classList.contains('positive')).toBe(true);
      });
    });

    it('should show negative color on negative P&L items', () => {
      component.loading = false;
      component.pnl = {
        ...mockPnl,
        realisedPnl: -500,
        unrealisedPnl: -1000,
      };
      fixture.detectChanges();

      const values = debugElement.queryAll(By.css('.pnl-value'));
      values.forEach((val) => {
        expect(val.nativeElement.classList.contains('negative')).toBe(true);
      });
    });
  });

  describe('error state', () => {
    it('should show error message when error is set', () => {
      component.loading = false;
      component.error = 'Unable to load P&L';
      fixture.detectChanges();

      const errorMsg = debugElement.query(By.css('.error-message'));
      expect(errorMsg.nativeElement.textContent).toContain('Unable to load P&L');
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

    it('should hide P&L content when error is shown', () => {
      component.loading = false;
      component.error = 'Network error';
      component.pnl = mockPnl;
      fixture.detectChanges();

      const pnlSummary = debugElement.query(By.css('.pnl-summary'));
      expect(pnlSummary).toBeFalsy();
    });
  });

  describe('interaction', () => {
    it('should have view details button', () => {
      component.loading = false;
      component.pnl = mockPnl;
      fixture.detectChanges();

      const viewBtn = debugElement.query(By.css('.btn-secondary'));
      expect(viewBtn).toBeTruthy();
      expect(viewBtn.nativeElement.textContent).toContain('View Details');
    });

    it('should have navigation button in header', () => {
      component.loading = false;
      fixture.detectChanges();

      const navBtn = debugElement.query(By.css('.btn-link'));
      expect(navBtn).toBeTruthy();
    });
  });

  describe('formatting', () => {
    it('should format currency with 2 decimal places', () => {
      component.loading = false;
      component.pnl = {
        ...mockPnl,
        realisedPnl: 123.4,
        unrealisedPnl: 456.7,
        totalPnl: 580.1,
      };
      fixture.detectChanges();

      const values = debugElement.queryAll(By.css('.pnl-value'));
      expect(values[0].nativeElement.textContent).toContain('123.40');
      expect(values[1].nativeElement.textContent).toContain('456.70');
    });

    it('should format large P&L values with commas', () => {
      component.loading = false;
      component.pnl = {
        ...mockPnl,
        realisedPnl: 1000000.50,
        unrealisedPnl: 2500000.75,
        totalPnl: 3500000.25,
      };
      fixture.detectChanges();

      const totalValue = debugElement.query(By.css('.total-value'));
      expect(totalValue.nativeElement.textContent).toContain('3,500,000.25');
    });

    it('should handle mixed positive and negative P&L', () => {
      component.loading = false;
      component.pnl = {
        ...mockPnl,
        realisedPnl: 1500, // positive
        unrealisedPnl: -500, // negative
        totalPnl: 1000, // positive total
      };
      fixture.detectChanges();

      const values = debugElement.queryAll(By.css('.pnl-value'));
      expect(values[0].nativeElement.classList.contains('positive')).toBe(true);
      expect(values[1].nativeElement.classList.contains('negative')).toBe(true);
    });
  });
});
