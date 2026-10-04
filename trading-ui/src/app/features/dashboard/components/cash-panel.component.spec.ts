import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CashPanelComponent } from './cash-panel.component';
import { DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';

describe('CashPanelComponent', () => {
  let component: CashPanelComponent;
  let fixture: ComponentFixture<CashPanelComponent>;
  let debugElement: DebugElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CashPanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CashPanelComponent);
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
      expect(title.nativeElement.textContent).toContain('Available Cash');
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

      const content = debugElement.query(By.css('.cash-amount'));
      expect(content).toBeFalsy();
    });

    it('should show content when not loading', () => {
      component.loading = false;
      component.cashBalance = 50000;
      fixture.detectChanges();

      const content = debugElement.query(By.css('.cash-amount'));
      expect(content).toBeTruthy();
    });
  });

  describe('data display', () => {
    it('should display formatted cash balance', () => {
      component.loading = false;
      component.cashBalance = 50000;
      fixture.detectChanges();

      const amount = debugElement.query(By.css('.amount'));
      expect(amount.nativeElement.textContent).toContain('50,000.00');
    });

    it('should display currency label', () => {
      component.loading = false;
      component.cashBalance = 1000;
      fixture.detectChanges();

      const label = debugElement.query(By.css('.cash-label'));
      expect(label.nativeElement.textContent).toContain('USD');
    });

    it('should handle zero balance', () => {
      component.loading = false;
      component.cashBalance = 0;
      fixture.detectChanges();

      const amount = debugElement.query(By.css('.amount'));
      expect(amount.nativeElement.textContent).toContain('0.00');
    });

    it('should handle large balances', () => {
      component.loading = false;
      component.cashBalance = 1000000.55;
      fixture.detectChanges();

      const amount = debugElement.query(By.css('.amount'));
      expect(amount.nativeElement.textContent).toContain('1,000,000.55');
    });
  });

  describe('error state', () => {
    it('should show error message when error is set', () => {
      component.loading = false;
      component.error = 'Unable to load cash balance';
      fixture.detectChanges();

      const errorMsg = debugElement.query(By.css('.error-message'));
      expect(errorMsg.nativeElement.textContent).toContain('Unable to load cash balance');
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

    it('should hide cash amount when error is shown', () => {
      component.loading = false;
      component.error = 'Network error';
      component.cashBalance = 50000;
      fixture.detectChanges();

      const amount = debugElement.query(By.css('.cash-amount'));
      expect(amount).toBeFalsy();
    });
  });

  describe('empty state', () => {
    it('should display zero balance gracefully', () => {
      component.loading = false;
      component.error = null;
      component.cashBalance = 0;
      fixture.detectChanges();

      const amount = debugElement.query(By.css('.amount'));
      expect(amount.nativeElement.textContent).toContain('0.00');
    });
  });

  describe('interaction', () => {
    it('should have deposit button', () => {
      component.loading = false;
      component.cashBalance = 50000;
      fixture.detectChanges();

      const depositBtn = debugElement.query(By.css('.btn-secondary'));
      expect(depositBtn).toBeTruthy();
      expect(depositBtn.nativeElement.textContent).toContain('Deposit');
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
      component.cashBalance = 123.4;
      fixture.detectChanges();

      const amount = debugElement.query(By.css('.amount'));
      expect(amount.nativeElement.textContent).toContain('123.40');
    });

    it('should format large numbers with commas', () => {
      component.loading = false;
      component.cashBalance = 1234567.89;
      fixture.detectChanges();

      const amount = debugElement.query(By.css('.amount'));
      expect(amount.nativeElement.textContent).toContain('1,234,567.89');
    });
  });
});
