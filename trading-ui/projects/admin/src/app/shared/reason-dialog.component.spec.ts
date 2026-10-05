import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReasonDialogComponent } from './reason-dialog.component';

describe('ReasonDialogComponent', () => {
  let fixture: ComponentFixture<ReasonDialogComponent>;
  let dialog: ReasonDialogComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ReasonDialogComponent] }).compileComponents();
    fixture = TestBed.createComponent(ReasonDialogComponent);
    dialog = fixture.componentInstance;
    fixture.detectChanges();
  });

  function el<T extends HTMLElement>(id: string): T {
    return (fixture.nativeElement as HTMLElement).querySelector<T>(`[data-testid="${id}"]`)!;
  }

  // Returned inside an object: an async function returning the promise itself
  // would wait for the dialog's answer instead of handing it back.
  async function open(): Promise<{ answer: Promise<string | null> }> {
    const answer = dialog.ask({ title: 'Suspend', description: 'd', confirmLabel: 'Go' });
    await fixture.whenStable();
    return { answer };
  }

  it('resolves with the trimmed reason when confirmed', async () => {
    const { answer } = await open();
    const input = el<HTMLTextAreaElement>('reason-input');
    input.value = '  Fraud reported by the customer  ';
    input.dispatchEvent(new Event('input'));

    el<HTMLButtonElement>('reason-confirm').click();

    expect(await answer).toBe('Fraud reported by the customer');
  });

  it('refuses a missing or too-short reason', async () => {
    const { answer } = await open();
    const input = el<HTMLTextAreaElement>('reason-input');
    input.value = ' x ';
    input.dispatchEvent(new Event('input'));

    el<HTMLButtonElement>('reason-confirm').click();
    await fixture.whenStable();

    expect(el('reason-error').textContent).toContain('Give a reason');
    dialog.close(null);
    expect(await answer).toBeNull();
  });

  it('resolves with null when cancelled', async () => {
    const { answer } = await open();
    dialog.close(null);
    expect(await answer).toBeNull();
  });
});
