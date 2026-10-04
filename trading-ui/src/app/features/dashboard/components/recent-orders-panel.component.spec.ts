import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RecentOrdersPanelComponent } from './recent-orders-panel.component';
import { DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';

describe('RecentOrdersPanelComponent', () => {
  let component: RecentOrdersPanelComponent;
  let fixture: ComponentFixture<RecentOrdersPanelComponent>;
  let debugElement: DebugElement;

  const mockOrders = [
    {
      orderId: '1',
      symbol: 'AAPL',
      side: 'BUY',
      quantity: 100,
      filledQuantity: 100,
      status: 'FILLED',
      createdAt: new Date(),
    },
    {
      orderId: '2',
      symbol: 'MSFT',
      side: 'SELL',
      quantity: 50,
      filledQuantity: 25,
      status: 'PARTIALLY_FILLED',
      createdAt: new Date(),
    },
    {
      orderId: '3',
      symbol: 'GOOGL',
      side: 'BUY',
      quantity: 25,
      filledQuantity: 0,
      status: 'PENDING',
      createdAt: new Date(),
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecentOrdersPanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RecentOrdersPanelComponent);
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
      expect(title.nativeElement.textContent).toContain('Recent Orders');
    });
  });

  describe('loading state', () => {
    it('should show loading skeleton when loading is true', () => {
      component.loading = true;
      fixture.detectChanges();

      const skeleton = debugElement.query(By.css('.skeleton-rows'));
      expect(skeleton).toBeTruthy();
    });

    it('should hide orders list when loading', () => {
      component.loading = true;
      fixture.detectChanges();

      const ordersList = debugElement.query(By.css('.orders-list'));
      expect(ordersList).toBeFalsy();
    });
  });

  describe('empty state', () => {
    it('should show empty message when no orders', () => {
      component.loading = false;
      component.orders = [];
      fixture.detectChanges();

      const emptyMsg = debugElement.query(By.css('.empty-message'));
      expect(emptyMsg).toBeTruthy();
      expect(emptyMsg.nativeElement.textContent).toContain('No orders yet');
    });

    it('should not show orders list when empty', () => {
      component.loading = false;
      component.orders = [];
      fixture.detectChanges();

      const ordersList = debugElement.query(By.css('.orders-list'));
      expect(ordersList).toBeFalsy();
    });
  });

  describe('data display', () => {
    it('should display all orders in the list', () => {
      component.loading = false;
      component.orders = mockOrders;
      fixture.detectChanges();

      const rows = debugElement.queryAll(By.css('.order-row'));
      expect(rows.length).toBe(mockOrders.length);
    });

    it('should display order symbol', () => {
      component.loading = false;
      component.orders = mockOrders;
      fixture.detectChanges();

      const symbols = debugElement.queryAll(By.css('.order-symbol'));
      expect(symbols[0].nativeElement.textContent).toContain('AAPL');
      expect(symbols[1].nativeElement.textContent).toContain('MSFT');
      expect(symbols[2].nativeElement.textContent).toContain('GOOGL');
    });

    it('should display order side with correct styling', () => {
      component.loading = false;
      component.orders = mockOrders;
      fixture.detectChanges();

      const sides = debugElement.queryAll(By.css('.order-side'));
      expect(sides[0].nativeElement.textContent).toContain('BUY');
      expect(sides[0].nativeElement.classList.contains('buy')).toBe(true);

      expect(sides[1].nativeElement.textContent).toContain('SELL');
      expect(sides[1].nativeElement.classList.contains('sell')).toBe(true);
    });

    it('should display quantity information', () => {
      component.loading = false;
      component.orders = mockOrders;
      fixture.detectChanges();

      const quantities = debugElement.queryAll(By.css('.order-quantity'));
      expect(quantities[0].nativeElement.textContent).toContain('100/100');
      expect(quantities[1].nativeElement.textContent).toContain('25/50');
    });

    it('should display status badges', () => {
      component.loading = false;
      component.orders = mockOrders;
      fixture.detectChanges();

      const badges = debugElement.queryAll(By.css('.status-badge'));
      expect(badges.length).toBeGreaterThan(0);
      expect(badges[0].nativeElement.textContent).toContain('FILLED');
    });
  });

  describe('status styling', () => {
    it('should apply correct status class for FILLED', () => {
      component.loading = false;
      component.orders = [mockOrders[0]];
      fixture.detectChanges();

      const badge = debugElement.query(By.css('.status-badge'));
      expect(badge.nativeElement.classList.contains('status-filled')).toBe(true);
    });

    it('should apply correct status class for PENDING', () => {
      component.loading = false;
      component.orders = [mockOrders[2]];
      fixture.detectChanges();

      const badge = debugElement.query(By.css('.status-badge'));
      expect(badge.nativeElement.classList.contains('status-pending')).toBe(true);
    });

    it('should apply correct status class for PARTIALLY_FILLED', () => {
      component.loading = false;
      component.orders = [mockOrders[1]];
      fixture.detectChanges();

      const badge = debugElement.query(By.css('.status-badge'));
      expect(badge.nativeElement.classList.contains('status-partially-filled')).toBe(true);
    });

    it('should format status text with spaces', () => {
      const formatted = component.formatStatus('PARTIALLY_FILLED');
      expect(formatted).toBe('PARTIALLY FILLED');
    });
  });

  describe('error state', () => {
    it('should show error message when error is set', () => {
      component.loading = false;
      component.error = 'Unable to load orders';
      fixture.detectChanges();

      const errorMsg = debugElement.query(By.css('.error-message'));
      expect(errorMsg.nativeElement.textContent).toContain('Unable to load orders');
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

    it('should hide orders list when error is shown', () => {
      component.loading = false;
      component.error = 'Network error';
      component.orders = mockOrders;
      fixture.detectChanges();

      const ordersList = debugElement.query(By.css('.orders-list'));
      expect(ordersList).toBeFalsy();
    });
  });

  describe('interaction', () => {
    it('should have view all orders button when orders exist', () => {
      component.loading = false;
      component.orders = mockOrders;
      fixture.detectChanges();

      const viewAllBtn = debugElement.query(By.css('.btn-secondary'));
      expect(viewAllBtn).toBeTruthy();
      expect(viewAllBtn.nativeElement.textContent).toContain('View All Orders');
    });

    it('should have create order button when no orders', () => {
      component.loading = false;
      component.orders = [];
      fixture.detectChanges();

      const createBtn = debugElement.query(By.css('.btn-primary'));
      expect(createBtn).toBeTruthy();
      expect(createBtn.nativeElement.textContent).toContain('Create Order');
    });

    it('should have navigation button in header', () => {
      component.loading = false;
      fixture.detectChanges();

      const navBtn = debugElement.query(By.css('.btn-link'));
      expect(navBtn).toBeTruthy();
    });
  });

  describe('side styling', () => {
    it('should show BUY orders in green', () => {
      component.loading = false;
      component.orders = [
        {
          ...mockOrders[0],
          side: 'BUY',
        },
      ];
      fixture.detectChanges();

      const side = debugElement.query(By.css('.order-side'));
      expect(side.nativeElement.classList.contains('buy')).toBe(true);
    });

    it('should show SELL orders in red', () => {
      component.loading = false;
      component.orders = [
        {
          ...mockOrders[0],
          side: 'SELL',
        },
      ];
      fixture.detectChanges();

      const side = debugElement.query(By.css('.order-side'));
      expect(side.nativeElement.classList.contains('sell')).toBe(true);
    });
  });

  describe('quantity display', () => {
    it('should show filled/total quantity format', () => {
      component.loading = false;
      component.orders = mockOrders;
      fixture.detectChanges();

      const quantities = debugElement.queryAll(By.css('.order-quantity'));
      expect(quantities[0].nativeElement.textContent).toMatch(/\d+\/\d+/);
    });

    it('should handle fully filled orders', () => {
      component.loading = false;
      component.orders = [{ ...mockOrders[0], filledQuantity: 100, quantity: 100 }];
      fixture.detectChanges();

      const quantity = debugElement.query(By.css('.order-quantity'));
      expect(quantity.nativeElement.textContent).toContain('100/100');
    });

    it('should handle partially filled orders', () => {
      component.loading = false;
      component.orders = [{ ...mockOrders[1], filledQuantity: 25, quantity: 50 }];
      fixture.detectChanges();

      const quantity = debugElement.query(By.css('.order-quantity'));
      expect(quantity.nativeElement.textContent).toContain('25/50');
    });

    it('should handle unfilled orders', () => {
      component.loading = false;
      component.orders = [{ ...mockOrders[2], filledQuantity: 0, quantity: 25 }];
      fixture.detectChanges();

      const quantity = debugElement.query(By.css('.order-quantity'));
      expect(quantity.nativeElement.textContent).toContain('0/25');
    });
  });
});
