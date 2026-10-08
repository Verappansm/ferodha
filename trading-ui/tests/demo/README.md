# Guided demo

One Playwright script that walks Ferodha the way a presenter would, with a
caption bar on screen and a green ring on everything before it is clicked:

1. **Customer** (trading UI, 4200): sign in, dashboard, markets search, an
   instrument's live quote, chart ranges and buy/sell/hold signal, a buy from
   the ticket with review and confirm (filled over Kafka), orders, portfolio,
   watchlist, strategies, a bank deposit, notifications, settings, sign out.
2. **Operator** (admin console, 4300): sign in, then every page in the menu.

Every step asserts what it shows, and any uncaught error in the browser fails
the run, so the same script is a smoke check of the whole platform.

## Run it

Start the whole stack first (`docker compose up --build` plus both UIs, or
`windows/start-windows.ps1`), then from `trading-ui/`:

```bash
npm run demo         # on screen, narrated; a video of each part in demo-results/
npm run demo:check   # headless, no pauses, about 15 seconds: is everything working?
```

`DEMO_PACE=1.5 npm run demo` slows the narration (bash; in PowerShell set
`$env:DEMO_PACE = '1.5'` first). Other settings, all optional:

| Variable                         | Default                                                |
| -------------------------------- | ------------------------------------------------------ |
| `UI_BASE_URL` / `ADMIN_BASE_URL` | `http://localhost:4200` / `http://localhost:4300`      |
| `DEMO_USER` / `DEMO_ADMIN`       | `e2e.trader@example.com` / `michael.brown@example.com` |
| `DEMO_PASSWORD`                  | `seed-password-change-me` (the seed password)          |
| `DEMO_SYMBOL`                    | `AAPL`                                                 |

The bank step deposits 100 with the seeded demo PIN 1234, and the buy step
places a real 2-share order, so each run leaves those behind. Run against a
fresh database (`docker compose down -v`) before a presentation if that matters.

First time on a machine: `npx playwright install chromium`.
