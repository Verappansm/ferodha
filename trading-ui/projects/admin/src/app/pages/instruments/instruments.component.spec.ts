import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { AdminApi } from '../../api/admin-api';
import { InstrumentsComponent } from './instruments.component';

const PAGE = {
  items: [
    {
      instrumentId: 'i-1',
      symbol: 'AAPL',
      name: 'Apple Inc.',
      exchange: 'NASDAQ',
      currency: 'USD',
      type: 'EQUITY',
      sector: 'Technology',
      tradable: true,
      changedByName: null,
      changedAt: null,
    },
  ],
  page: 0,
  size: 25,
  totalItems: 1,
};

describe('InstrumentsComponent adding an instrument', () => {
  let fixture: ComponentFixture<InstrumentsComponent>;
  let addInstrument: ReturnType<typeof vi.fn>;
  let listInstruments: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    listInstruments = vi.fn().mockReturnValue(of(PAGE));
    addInstrument = vi.fn().mockReturnValue(of({ ...PAGE.items[0], symbol: 'NEWCO' }));
    await TestBed.configureTestingModule({
      imports: [InstrumentsComponent],
      providers: [{ provide: AdminApi, useValue: { listInstruments, addInstrument } }],
    }).compileComponents();
    fixture = TestBed.createComponent(InstrumentsComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  });

  function el(testId: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  }
  function text(testId: string): string {
    return el(testId)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }
  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }
  function type(testId: string, value: string): void {
    const input = el(testId) as HTMLInputElement | HTMLSelectElement;
    input.value = value;
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input'));
  }
  async function openAndFill(ticker = 'newco'): Promise<void> {
    (el('instrument-add') as HTMLButtonElement).click();
    await settle();
    type('add-ticker', ticker);
    type('add-name', 'NewCo Inc.');
    type('add-exchange', 'NASDAQ');
    type('add-reason', 'Listing requested');
  }

  it('opens the form, upper-cases the ticker and sends the instrument with its reason', async () => {
    await openAndFill();
    expect((el('add-ticker') as HTMLInputElement).value).toBe('NEWCO');

    (el('add-save') as HTMLButtonElement).click();
    await settle();

    expect(addInstrument).toHaveBeenCalledWith({
      ticker: 'NEWCO',
      name: 'NewCo Inc.',
      exchange: 'NASDAQ',
      currency: 'USD',
      type: 'EQUITY',
      sector: undefined,
      reason: 'Listing requested',
    });
    expect(el('instrument-add-form')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('NEWCO is added and tradable');
  });

  it('opens as a side panel that Escape, the close button and the dimmed page all close', async () => {
    (el('instrument-add') as HTMLButtonElement).click();
    await settle();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeTruthy();

    fixture.nativeElement
      .querySelector('[role="dialog"]')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();

    (el('instrument-add') as HTMLButtonElement).click();
    await settle();
    (fixture.nativeElement.querySelector('.drawer-h .icon-btn') as HTMLButtonElement).click();
    await settle();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();

    (el('instrument-add') as HTMLButtonElement).click();
    await settle();
    (fixture.nativeElement.querySelector('.scrim') as HTMLElement).click();
    await settle();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it('blocks a bad ticker and a missing name before anything is sent', async () => {
    (el('instrument-add') as HTMLButtonElement).click();
    await settle();
    type('add-ticker', 'not valid!');
    (el('add-save') as HTMLButtonElement).click();
    await settle();
    expect(addInstrument).not.toHaveBeenCalled();
    expect(text('add-ticker-error')).toContain('Letters, digits, dots or hyphens');
  });

  it('says so when the ticker already exists', async () => {
    addInstrument.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { errorCode: 'ADM-409', message: 'Conflict' },
          }),
      ),
    );
    await openAndFill('AAPL');
    (el('add-save') as HTMLButtonElement).click();
    await settle();
    expect(text('add-error')).toBe('An instrument with that ticker already exists.');
    expect(el('instrument-add-form')).toBeTruthy();
  });
});
