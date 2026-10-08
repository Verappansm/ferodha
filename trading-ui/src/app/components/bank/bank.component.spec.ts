import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import bcrypt from 'bcryptjs';
import { of, throwError } from 'rxjs';
import { BankComponent, PIN_PROOF_SALT } from './bank.component';
import { TradeApi } from '../../api/trade-api';
import { provideStubPreferences } from '../../core/preferences/preferences.testing';
import { Session } from '../../core/session/session';

const FUNDS = {
  accountId: 3,
  bankAccountNumber: 'BANK-100001',
  tradingBalance: 2500.5,
  bankBalance: 25000,
  currency: 'USD',
  asOf: '2026-10-07T10:00:00Z',
};

describe('BankComponent', () => {
  let fixture: ComponentFixture<BankComponent>;
  let bankFunds: ReturnType<typeof vi.fn>;
  let bankTransfer: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    bankFunds = vi.fn().mockReturnValue(of(FUNDS));
    bankTransfer = vi
      .fn()
      .mockReturnValue(of({ ...FUNDS, tradingBalance: 2550.5, bankBalance: 24950 }));
    await TestBed.configureTestingModule({
      imports: [BankComponent],
      providers: [
        provideStubPreferences(),
        { provide: Session, useValue: { accountId: () => 3 } },
        { provide: TradeApi, useValue: { bankFunds, bankTransfer } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(BankComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('the PIN proof salt is a valid bcrypt salt, and 1234 gives the proof the server expects', () => {
    // A salt one character short makes bcryptjs throw before any request is sent.
    expect(PIN_PROOF_SALT).toHaveLength(7 + 22);
    expect(bcrypt.hashSync('1234', PIN_PROOF_SALT)).toBe(
      '$2b$12$D6aOfmGWG4oQpLdkJ0PV.eoxub08hIXYphEVFFv9OlsB8EJNwktz.',
    );
  });

  it('loads and shows both balances of the signed-in account', () => {
    expect(bankFunds).toHaveBeenCalledWith(3);
    expect(fixture.nativeElement.textContent).toContain('2,500.50');
    expect(fixture.nativeElement.textContent).toContain('25,000.00');
  });

  it('asks for an amount and a PIN before sending anything', async () => {
    await fixture.componentInstance.submit();
    expect(bankTransfer).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toContain('positive amount and your bank PIN');
  });

  it('sends the bcrypt proof of the PIN, never the PIN, with a one-off key, then shows the new balances', async () => {
    const c = fixture.componentInstance;
    c.amount.set(50);
    c.pin.set('1234');
    await c.submit();

    expect(bankTransfer).toHaveBeenCalledTimes(1);
    const [accountId, type, body] = bankTransfer.mock.calls[0];
    expect(accountId).toBe(3);
    expect(type).toBe('DEPOSIT');
    expect(body.amount).toBe(50);
    expect(body.pinHash).toBe('$2b$12$D6aOfmGWG4oQpLdkJ0PV.eoxub08hIXYphEVFFv9OlsB8EJNwktz.');
    expect(JSON.stringify(body)).not.toContain('"1234"');
    expect(body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(c.pin()).toBe('');
    expect(c.success()).toContain('Deposit completed');
    expect(c.funds()?.tradingBalance).toBe(2550.5);
  });

  it('a withdrawal says so, and a refusal shows the server message without clearing the amount', async () => {
    const c = fixture.componentInstance;
    c.transactionType.set('WITHDRAWAL');
    c.amount.set(10);
    c.pin.set('0000');
    bankTransfer.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { errorCode: 'BNK-400', message: 'Transfer could not be completed.' },
          }),
      ),
    );
    await c.submit();
    expect(c.error()).not.toBe('');
    expect(c.success()).toBe('');
    expect(c.amount()).toBe(10);
  });
  it('a retry after no answer reuses the same key, so the money can never move twice', async () => {
    const c = fixture.componentInstance;
    c.amount.set(50);
    c.pin.set('1234');
    bankTransfer.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    await c.submit();
    expect(c.error()).toContain('could not confirm');

    await c.submit();
    const [first, second] = bankTransfer.mock.calls.map((call) => call[2].idempotencyKey);
    expect(second).toBe(first);
  });

  it('a different amount is a different transfer, with a new key', async () => {
    const c = fixture.componentInstance;
    c.amount.set(50);
    c.pin.set('1234');
    bankTransfer.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    await c.submit();
    c.setAmount(60);
    await c.submit();
    const [first, second] = bankTransfer.mock.calls.map((call) => call[2].idempotencyKey);
    expect(second).not.toBe(first);
  });

  it('refuses an amount with more than two decimals before sending', async () => {
    const c = fixture.componentInstance;
    c.amount.set(10.005);
    c.pin.set('1234');
    await c.submit();
    expect(bankTransfer).not.toHaveBeenCalled();
    expect(c.error()).toContain('2 decimal places');
  });
});
