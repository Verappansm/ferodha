import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardComponent } from './dashboard.component';
import { PortfolioService } from '../../services/portfolio.service';
import { OrderService } from '../../services/order.service';
import { AuthService } from '../../services/auth.service';
import { of, throwError } from 'rxjs';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let portfolioService: jasmine.SpyObj<PortfolioService>;
  let orderService: jasmine.SpyObj<OrderService>;
  let authService: jasmine.SpyObj<AuthService>;

  const mockUser = { id: '123', accountId: 456, username: 'testuser' };
  const mockPortfolioSummary = {
    accountId: 456,
    baseCurrency: 'USD',
    cashBalance: 50000,
    marketValue: 145000,
    costBasis: 140000,
    unrealisedPnl: 5000,
    realisedPnl: 2500,
    totalValue: 195000,
    positionCount: 5,
    partial: false,
    priceAsOf: '2026-10-04T11:35:35+05:30',
    asOf: '2026-10-04T11:35:35+05:30',
  };

  const mockPnl = {
    accountId: 456,
    baseCurrency: 'USD',
    realisedPnl: 2500,
    unrealisedPnl: 5000,
    totalPnl: 7500,
    asOf: '2026-10-04T11:35:35+05:30',
  };

  const mockOrders = [
    {
      orderId: '1',
      symbol: 'AAPL',
      side: 'BUY',
      quantity: 100,
      status: 'FILLED',
      filledQuantity: 100,
      createdAt: new Date(),
    },
    {
      orderId: '2',
      symbol: 'MSFT',
      side: 'BUY',
      quantity: 50,
      status: 'PENDING',
      filledQuantity: 0,
      createdAt: new Date(),
    },
  ];

  const mockPositions = [
    {
      symbol: 'AAPL',
      quantity: 100,
      marketValue: 15550,
      unrealisedPnl: 550,
      stale: false,
    },
    {
      symbol: 'MSFT',
      quantity: 50,
      marketValue: 15000,
      unrealisedPnl: 1000,
      stale: false,
    },
  ];

  beforeEach(async () => {
    const portfolioServiceSpy = jasmine.createSpyObj('PortfolioService', [
      'getPortfolioSummary',
      'getPnl',
      'getTopPositions',
    ]);
    const orderServiceSpy = jasmine.createSpyObj('OrderService', ['getRecentOrders']);
    const authServiceSpy = jasmine.createSpyObj('AuthService', ['getCurrentUser']);

    portfolioServiceSpy.getPortfolioSummary.and.returnValue(of(mockPortfolioSummary));
    portfolioServiceSpy.getPnl.and.returnValue(of(mockPnl));
    portfolioServiceSpy.getTopPositions.and.returnValue(of(mockPositions));
    orderServiceSpy.getRecentOrders.and.returnValue(of(mockOrders));
    authServiceSpy.getCurrentUser.and.returnValue(of(mockUser));

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        { provide: PortfolioService, useValue: portfolioServiceSpy },
        { provide: OrderService, useValue: orderServiceSpy },
        { provide: AuthService, useValue: authServiceSpy },
      ],
    }).compileComponents();

    portfolioService = TestBed.inject(PortfolioService) as jasmine.SpyObj<PortfolioService>;
    orderService = TestBed.inject(OrderService) as jasmine.SpyObj<OrderService>;
    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
  });

  describe('initialization', () => {
    it('should create the dashboard component', () => {
      expect(component).toBeTruthy();
    });

    it('should load all data on init', () => {
      fixture.detectChanges();

      expect(authService.getCurrentUser).toHaveBeenCalled();
      // Wait for async operations
      fixture.whenStable().then(() => {
        expect(portfolioService.getPortfolioSummary).toHaveBeenCalledWith(mockUser.accountId);
        expect(portfolioService.getPnl).toHaveBeenCalledWith(mockUser.accountId);
        expect(orderService.getRecentOrders).toHaveBeenCalledWith(mockUser.accountId, 5);
        expect(portfolioService.getTopPositions).toHaveBeenCalledWith(mockUser.accountId, 5);
      });
    });

    it('should set accountId from authenticated user', (done) => {
      fixture.detectChanges();

      setTimeout(() => {
        expect(component.accountId()).toBe(mockUser.accountId);
        done();
      }, 100);
    });
  });

  describe('cash panel', () => {
    it('should display cash balance after loading', (done) => {
      fixture.detectChanges();

      setTimeout(() => {
        expect(component.cashBalance()).toBe(mockPortfolioSummary.cashBalance);
        expect(component.cashLoading()).toBe(false);
        expect(component.cashError()).toBeNull();
        done();
      }, 100);
    });

    it('should handle cash loading error', (done) => {
      portfolioService.getPortfolioSummary.and.returnValue(
        throwError(() => new Error('Network error'))
      );

      component.reloadCash();

      setTimeout(() => {
        expect(component.cashLoading()).toBe(false);
        expect(component.cashError()).toBeTruthy();
        done();
      }, 100);
    });

    it('should retry cash loading on manual retry', (done) => {
      portfolioService.getPortfolioSummary.and.returnValue(
        throwError(() => new Error('First attempt failed'))
      );

      component.reloadCash();

      setTimeout(() => {
        expect(component.cashError()).toBeTruthy();

        // Change mock to succeed
        portfolioService.getPortfolioSummary.and.returnValue(of(mockPortfolioSummary));
        component.reloadCash();

        setTimeout(() => {
          expect(component.cashError()).toBeNull();
          expect(component.cashBalance()).toBe(mockPortfolioSummary.cashBalance);
          done();
        }, 50);
      }, 50);
    });
  });

  describe('P&L panel', () => {
    it('should display P&L data after loading', (done) => {
      fixture.detectChanges();

      setTimeout(() => {
        expect(component.pnlData()).toEqual(mockPnl);
        expect(component.pnlLoading()).toBe(false);
        expect(component.pnlError()).toBeNull();
        done();
      }, 100);
    });

    it('should handle P&L loading error', (done) => {
      portfolioService.getPnl.and.returnValue(throwError(() => new Error('Network error')));

      component.reloadPnl();

      setTimeout(() => {
        expect(component.pnlLoading()).toBe(false);
        expect(component.pnlError()).toBeTruthy();
        done();
      }, 100);
    });
  });

  describe('orders panel', () => {
    it('should display recent orders after loading', (done) => {
      fixture.detectChanges();

      setTimeout(() => {
        expect(component.recentOrders().length).toBe(mockOrders.length);
        expect(component.ordersLoading()).toBe(false);
        expect(component.ordersError()).toBeNull();
        done();
      }, 100);
    });

    it('should show empty state when no orders', (done) => {
      orderService.getRecentOrders.and.returnValue(of([]));

      component.reloadOrders();

      setTimeout(() => {
        expect(component.recentOrders().length).toBe(0);
        expect(component.isEmptyState()).toBe(true);
        done();
      }, 100);
    });

    it('should handle orders loading error gracefully', (done) => {
      orderService.getRecentOrders.and.returnValue(
        throwError(() => new Error('Network error'))
      );

      component.reloadOrders();

      setTimeout(() => {
        expect(component.ordersLoading()).toBe(false);
        expect(component.ordersError()).toBeTruthy();
        // Other panels should still render (not affected by order error)
        expect(component.cashBalance()).toBe(mockPortfolioSummary.cashBalance);
        done();
      }, 100);
    });
  });

  describe('positions panel', () => {
    it('should display top positions after loading', (done) => {
      fixture.detectChanges();

      setTimeout(() => {
        expect(component.topPositions().length).toBeGreaterThan(0);
        expect(component.positionsLoading()).toBe(false);
        expect(component.positionsError()).toBeNull();
        done();
      }, 100);
    });

    it('should sort positions by market value', (done) => {
      const unsortedPositions = [
        { ...mockPositions[1], marketValue: 5000 },
        { ...mockPositions[0], marketValue: 15000 },
      ];
      portfolioService.getTopPositions.and.returnValue(of(unsortedPositions));

      component.reloadPositions();

      setTimeout(() => {
        const positions = component.topPositions();
        expect(positions[0].marketValue).toBeGreaterThanOrEqual(positions[1].marketValue);
        done();
      }, 100);
    });

    it('should handle empty positions gracefully', (done) => {
      portfolioService.getTopPositions.and.returnValue(of([]));

      component.reloadPositions();

      setTimeout(() => {
        expect(component.topPositions().length).toBe(0);
        done();
      }, 100);
    });
  });

  describe('error handling', () => {
    it('should show independent error messages for each panel', (done) => {
      // Make portfolio and orders fail, but P&L succeed
      portfolioService.getPortfolioSummary.and.returnValue(
        throwError(() => new Error('Portfolio error'))
      );
      orderService.getRecentOrders.and.returnValue(
        throwError(() => new Error('Orders error'))
      );
      // P&L should still succeed

      fixture.detectChanges();

      setTimeout(() => {
        // Cash panel should show error
        expect(component.cashError()).toBeTruthy();
        // Orders panel should show error
        expect(component.ordersError()).toBeTruthy();
        // But P&L should load successfully
        expect(component.pnlError()).toBeNull();
        expect(component.pnlData()).toEqual(mockPnl);
        done();
      }, 100);
    });

    it('should not blank entire page if one panel fails', (done) => {
      orderService.getRecentOrders.and.returnValue(
        throwError(() => new Error('Orders API down'))
      );

      fixture.detectChanges();

      setTimeout(() => {
        // Cash panel should still render
        expect(component.cashLoading()).toBe(false);
        expect(component.cashBalance()).toBeGreaterThan(0);

        // P&L panel should still render
        expect(component.pnlLoading()).toBe(false);
        expect(component.pnlData()).toBeTruthy();

        done();
      }, 100);
    });
  });

  describe('empty state', () => {
    it('should show empty state when user has no orders or positions', (done) => {
      orderService.getRecentOrders.and.returnValue(of([]));
      portfolioService.getTopPositions.and.returnValue(of([]));

      fixture.detectChanges();

      setTimeout(() => {
        expect(component.isEmptyState()).toBe(true);
        done();
      }, 100);
    });

    it('should not show empty state when user has orders or positions', (done) => {
      fixture.detectChanges();

      setTimeout(() => {
        expect(component.isEmptyState()).toBe(false);
        done();
      }, 100);
    });
  });
});
