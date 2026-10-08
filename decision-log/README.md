# Architecture decision log

One file per decision, numbered in order. Each entry follows the same shape:

- a status table (Status, Date, Decided by)
- **Context**
- **Options considered**: at least one option genuinely weighed and rejected
- **Decision**
- **Consequences**, including any known limits

Write an entry when:

- reversing the choice later would cost more than an afternoon, or
- a competent engineer would have chosen the other option, or
- someone asked why and the answer took a paragraph.

Write it when the decision is taken. If the team later reverses a decision,
add a new entry that supersedes it. Don't edit the old one.

## Index

| # | Decision | Seam / area |
|---|---|---|
| [0001](0001-strategies-trade-under-a-delegated-token.md) | Strategies place orders under a short-lived delegated token | Auth / strategies |
| [0002](0002-strategy-limits-and-stopping.md) | Strategy limits and stopping | Strategies |
| [0003](0003-fills-priced-at-the-live-ticker.md) | Fills priced at the live ticker | Executor / pricing |
| [0004](0004-notifications-fall-back-to-in-app-when-preferences-do-not-answer.md) | When preferences don't answer, notifications fall back to IN_APP | **What notifications does when preferences doesn't answer** |
| [0005](0005-modules-talk-over-kafka-and-tokens-are-verified-locally.md) | Services talk over Kafka; trade_api verifies tokens locally | **How one module calls another** |
| [0006](0006-failed-deliveries-dead-letter-in-the-executor-and-queue-in-notifications.md) | Failed alerts are recorded as QUEUED; the executor dead-letters | **What happens to an alert whose delivery fails** |
| [0007](0007-users-table-owns-contact-details-read-on-demand.md) | `Users.email` owns contact details; read on demand, never copied | **Which module owns the customer's contact details** |
| [0008](0008-admin-tokens-separated-by-audience-on-one-key.md) | Admin tokens separated by audience on one key | Auth |
| [0009](0009-new-users-wait-for-admin-approval-before-an-account.md) | New users wait for admin approval before getting an account | Onboarding |
| [0010](0010-executor-idempotency-by-conditional-update.md) | Executor idempotency through a guarded UPDATE | Executor / data |
| [0011](0011-client-side-password-digest.md) | The browser sends a salted SHA-256 digest of the password | Auth / UI |
| [0012](0012-bank-linking-by-verified-email.md) | A trading account is linked to the bank account held under the user's verified email | Onboarding / bank |
| [0013](0013-notifications-one-path-one-preference.md) | Notifications: one entry point, the Settings preferences, real SMTP, an in-app list | Notifications |

Related: [`story_docs/contract-breach.md`](../story_docs/contract-breach.md)
records each departure from the Neueda contracts. The
[OWASP review](../OWASP-SECURITY-REVIEW.md) tracks the security items these
entries mention.
