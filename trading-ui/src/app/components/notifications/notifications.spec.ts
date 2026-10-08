import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Session } from '../../core/session/session';
import { NotificationsStore, POLL_MS } from '../../core/notifications/notifications.store';
import { NotificationsComponent } from './notifications.component';

const URL = 'http://localhost:8080/api/v1/notifications';

function note(id: string, readAt: string | null = null) {
  return {
    notificationId: id,
    eventType: 'ORDER_FILLED',
    orderId: 'ORD-1',
    symbol: 'AAPL',
    resolvedChannel: 'IN_APP',
    message: `Your order ORD-1 for AAPL has been filled. (${id})`,
    status: 'SENT',
    createdAt: '2026-10-07T10:00:00Z',
    readAt,
  };
}

describe('Notifications (LEAP-008)', () => {
  const isSignedIn = signal(true);
  let http: HttpTestingController;

  beforeEach(() => {
    isSignedIn.set(true);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Session, useValue: { isSignedIn } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    isSignedIn.set(false);
    TestBed.flushEffects();
    vi.useRealTimers();
  });

  function answer(body: { notifications: unknown[]; total: number; unread: number }) {
    http.expectOne((r) => r.url === URL && r.method === 'GET').flush(body);
  }

  it('reads the list and the unread count as soon as someone is signed in', async () => {
    const store = TestBed.inject(NotificationsStore);
    TestBed.flushEffects();
    answer({ notifications: [note('a'), note('b', '2026-10-07T11:00:00Z')], total: 2, unread: 1 });
    await Promise.resolve();

    expect(store.items()).toHaveLength(2);
    expect(store.unread()).toBe(1);
  });

  it('keeps the count fresh every 30 seconds, and stops and clears when signed out', async () => {
    vi.useFakeTimers();
    const store = TestBed.inject(NotificationsStore);
    TestBed.flushEffects();
    answer({ notifications: [], total: 0, unread: 0 });

    await vi.advanceTimersByTimeAsync(POLL_MS);
    answer({ notifications: [note('a')], total: 1, unread: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.unread()).toBe(1);

    isSignedIn.set(false);
    TestBed.flushEffects();
    expect(store.unread()).toBe(0);
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    http.expectNone(URL);
  });

  it('a failed background refresh keeps what is already shown', async () => {
    const store = TestBed.inject(NotificationsStore);
    TestBed.flushEffects();
    answer({ notifications: [note('a')], total: 1, unread: 1 });
    await Promise.resolve();

    void store.refresh(false);
    http.expectOne((r) => r.url === URL).flush('x', { status: 500, statusText: 'err' });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.items()).toHaveLength(1);
    expect(store.error()).toBe('');
  });

  describe('the page', () => {
    async function open(unread = 2) {
      const fixture = TestBed.createComponent(NotificationsComponent);
      fixture.detectChanges();
      TestBed.flushEffects();
      http
        .match((r) => r.url === URL && r.method === 'GET')
        .forEach((req) =>
          req.flush({
            notifications: [note('a'), note('b'), note('c', '2026-10-07T11:00:00Z')],
            total: 3,
            unread,
          }),
        );
      await fixture.whenStable();
      fixture.detectChanges();
      return fixture;
    }
    const el = (f: { nativeElement: HTMLElement }, id: string) =>
      f.nativeElement.querySelector<HTMLElement>(`[data-testid="${id}"]`);

    it('lists them newest first with a word, not just a colour, for the unread ones', async () => {
      const fixture = await open();

      expect(el(fixture, 'notification-a')?.textContent).toContain('Order filled');
      expect(el(fixture, 'notification-a')?.textContent).toContain('New');
      expect(el(fixture, 'notification-c')?.textContent).not.toContain('New');
      expect(el(fixture, 'read-c')).toBeNull();
    });

    it('marking one read sends the request, then updates it and the count', async () => {
      const fixture = await open();

      el(fixture, 'read-a')!.click();
      http.expectOne(`${URL}/a/read`).flush(null, { status: 204, statusText: 'No Content' });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(el(fixture, 'notification-a')?.textContent).not.toContain('New');
      expect(TestBed.inject(NotificationsStore).unread()).toBe(1);
    });

    it('mark all as read clears the count, and is disabled when nothing is unread', async () => {
      const fixture = await open();

      el(fixture, 'mark-all-read')!.click();
      http.expectOne(`${URL}/read-all`).flush(null, { status: 204, statusText: 'No Content' });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(TestBed.inject(NotificationsStore).unread()).toBe(0);
      expect((el(fixture, 'mark-all-read') as HTMLButtonElement).disabled).toBe(true);
    });

    it('says so when there is nothing yet', async () => {
      const fixture = TestBed.createComponent(NotificationsComponent);
      fixture.detectChanges();
      TestBed.flushEffects();
      http
        .match((r) => r.url === URL)
        .forEach((req) => req.flush({ notifications: [], total: 0, unread: 0 }));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(el(fixture, 'notifications-empty')).not.toBeNull();
    });
  });
});
