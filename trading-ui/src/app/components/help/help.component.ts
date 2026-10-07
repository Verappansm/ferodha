import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Where a customer writes for help. Change here; the page and its test read it. */
export const SUPPORT_EMAIL = 'support@ferodha.example';

/**
 * Static answers to the common questions, reachable signed in or out (LEAP-026).
 * Each answer is a native <details>, so it opens from the keyboard with no script.
 */
@Component({
  selector: 'app-help',
  imports: [RouterLink],
  styles: `
    .help {
      max-width: 44rem;
      margin: 2rem auto;
      padding: 0 1rem;
    }
    h1 {
      margin: 0 0 0.25rem;
      color: var(--ink-900);
    }
    .lead {
      color: var(--ink-700);
      margin: 0 0 1.5rem;
    }
    details {
      background: var(--surface);
      border: 1px solid var(--ink-200);
      border-radius: var(--radius);
      padding: 0.75rem 1rem;
      margin-bottom: 0.75rem;
    }
    summary {
      cursor: pointer;
      font-weight: 600;
      color: var(--ink-900);
    }
    summary:focus-visible,
    a:focus-visible {
      outline: 3px solid var(--brand-500);
      outline-offset: 2px;
    }
    details p,
    details ol {
      color: var(--ink-700);
      margin: 0.75rem 0 0;
    }
    .contact {
      margin-top: 2rem;
      padding: 1rem;
      border-radius: var(--radius);
      background: var(--brand-100);
      color: var(--ink-900);
    }
  `,
  template: `
    <div class="help" data-testid="help">
      <h1>Help and support</h1>
      <p class="lead">Answers to the questions we hear most.</p>

      <details data-testid="faq-order">
        <summary>Why is my order still in process?</summary>
        <p>
          An order is sent to the trade executor, which fills it when the live price allows. A limit
          order fills only when the market reaches your limit price: a buy when the price is at or
          below it, a sell when it is at or above. Until then it stays open, and a large order may
          fill in parts (partially filled). You can cancel an open order on the Orders page; one
          that has already filled can't be cancelled. If an order is rejected, its row says why, for
          example not enough cash or shares.
        </p>
      </details>

      <details data-testid="faq-approval">
        <summary>Why does sign-in wait for approval?</summary>
        <ol>
          <li>
            You register and we email you a 6-digit code. Entering it proves the address is yours.
          </li>
          <li>
            Our bank partner holds your bank account under that same email, so an administrator
            links that account to your new trading account. They can only use an account the bank
            already holds for you, never create one, and each bank account belongs to one person.
          </li>
          <li>Once it is linked you can sign in and trade.</li>
        </ol>
        <p>
          Until step 2 is done, sign-in is refused. If you never got the code, ask for a new one on
          the registration page (one a minute) and check your spam folder.
        </p>
      </details>

      <details data-testid="faq-fees">
        <summary>How are fees worked out?</summary>
        <p>
          Each filled order pays a commission: the trade value times the fee rate (0.1% unless the
          order review says otherwise), charged in your account's currency. A buy costs the value
          plus the fee; a sell pays you the value minus the fee. The order review shows the exact
          figures before you confirm. Where an instrument is priced in a different currency from
          your account, we convert at a fixed rate of 90 INR to 1 USD. Only USD and INR are
          supported.
        </p>
      </details>

      <details data-testid="faq-bank">
        <summary>How do I move money between my bank and my trading account?</summary>
        <p>
          Open the Bank page, choose deposit or withdrawal, enter the amount and your bank PIN. The
          PIN is checked by the bank, and never leaves your browser in the clear. If a transfer is
          refused, nothing has moved.
        </p>
      </details>

      <section class="contact" aria-labelledby="contact-title">
        <h2 id="contact-title">Still stuck?</h2>
        <p>
          Email <a [href]="'mailto:' + email" data-testid="support-email">{{ email }}</a> with the
          page you were on and what you expected. Please don't send your password or PIN; we will
          never ask for them.
        </p>
        <p><a routerLink="/login">Back to sign in</a></p>
      </section>
    </div>
  `,
})
export class HelpComponent {
  protected readonly email = SUPPORT_EMAIL;
}
