import { Locator, Page, test } from '@playwright/test';

/**
 * Small helpers that turn a Playwright script into a narrated demo: a caption
 * bar at the bottom of the screen, a highlight ring on whatever is about to be
 * clicked, and pauses long enough for an audience to follow. Under the
 * `check` project the same script runs with no pauses, as a smoke check.
 */
function pace(): number {
  if (test.info().project.name === 'check') return 0;
  return Number(process.env.DEMO_PACE ?? '1');
}

export async function pause(page: Page, ms = 1200): Promise<void> {
  if (pace() > 0) await page.waitForTimeout(ms * pace());
}

/** Shows a caption bar (title and an optional line) and holds it on screen. */
export async function say(page: Page, title: string, line = '', hold = 1800): Promise<void> {
  await page.evaluate(
    ([t, l]) => {
      let bar = document.getElementById('demo-caption');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'demo-caption';
        bar.setAttribute('aria-hidden', 'true');
        Object.assign(bar.style, {
          position: 'fixed',
          left: '50%',
          bottom: '24px',
          transform: 'translateX(-50%)',
          zIndex: '2147483647',
          maxWidth: '760px',
          padding: '14px 22px',
          borderRadius: '14px',
          background: 'rgba(15, 23, 42, 0.92)',
          color: '#fff',
          font: '500 15px/1.45 system-ui, sans-serif',
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
          pointerEvents: 'none',
          transition: 'opacity 0.25s ease',
        });
        document.body.appendChild(bar);
      }
      bar.innerHTML = `<div style="font-weight:700;font-size:16px;color:#4ade80">${t}</div>${
        l ? `<div style="opacity:.9;margin-top:4px">${l}</div>` : ''
      }`;
      bar.style.opacity = '1';
    },
    [title, line],
  );
  await pause(page, hold);
}

/** Rings an element for a moment before the script acts on it. */
export async function spotlight(target: Locator, ms = 700): Promise<void> {
  if (pace() <= 0) return;
  await target.scrollIntoViewIfNeeded();
  await target.evaluate((el: HTMLElement) => {
    el.dataset['demoOutline'] = el.style.outline;
    el.style.outline = '3px solid #22c55e';
    el.style.outlineOffset = '3px';
    el.style.transition = 'outline-color 0.2s ease';
  });
  await target.page().waitForTimeout(ms * pace());
  await target.evaluate((el: HTMLElement) => {
    el.style.outline = el.dataset['demoOutline'] ?? '';
  });
}

export async function click(target: Locator): Promise<void> {
  await spotlight(target);
  await target.click();
}

/** Types like a person would, so the audience can read it. */
export async function type(target: Locator, text: string): Promise<void> {
  await spotlight(target, 400);
  await target.fill('');
  await target.pressSequentially(text, { delay: pace() > 0 ? 70 * pace() : 0 });
}
