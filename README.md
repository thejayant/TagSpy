# TagLens

See the GA4 configuration and Google Tag Manager container behind any website, the way ga4spy.com/ga4 and ga4spy.com/gtm do. Enter an ID (`G-…`, `GT-…`, `GTM-…`) or a website URL.

Everything comes from the public, published responses Google serves to every visitor (`gtag/js` and `gtm.js`). The compiled JavaScript is parsed as data and never executed. No Google account is needed.

## Quick start

```bash
cp .env.example .env.local
npm install
npm run dev        # web on :3000 + alerts worker
```

Open http://localhost:3000. It redirects to `/ga4`. Shareable links look like `/ga4?id=G-XXXX` and `/gtm?id=GTM-XXXX&view=triggers`.

## Features

**GA4 (`/ga4`)**
- Header metrics: library version, key events, created and modified events, cross-domain domains, unwanted referrals.
- Events: enhanced measurement (per-interaction on/off, site-search params), create-event rules with conditions and parameter operations, modify-event rules, key events, and data redaction.
- Google tag: automatic event detection, domains, internal traffic rules, unwanted referrals, session timeout and engaged-session timer, cookie overrides, UA event collection, user-provided data capabilities, data use across Google services, page data extraction, connected site tags, data transmission, consent-mode overrides, and default EEA consent.
- Data collection: Google Signals, granular location/device restrictions by region, user-provided data collection and stitching. Also shows tag signals.
- Expand all / collapse all, refresh, share link, per-property change history, and watch alerts.

**GTM (`/gtm`)**
- A workspace with Tags, Triggers, Variables, Stats and Versions views, plus a summary: counts, destinations, IDs, weight, paused/unused/custom-code flags. The flags are clickable filters.
- Search, filtering by type, paused-only, unused-only, no-trigger and user-defined-only filters.
- Detail drawers like GTM's editor:
  - Tags: identifiers, parameters with clickable `{{variable}}` references, the Custom HTML code viewer (copy/download), More and Advanced settings (priority, firing option, sequencing, consent), and firing and blocking triggers.
  - Triggers: type, "fires on all/some", conditions, listener settings, and the tags they fire or block.
  - Variables: config, custom JS, and which tags/triggers/variables use them.
- Stats: where data goes (vendor groups with IDs, including Custom HTML vendors like Meta Pixel and Clarity), and breakdowns by tag, trigger and variable type.
- **Download as a Tag Manager import file** (`exportFormatVersion: 2`). Paused tags carry no parameters, and custom-template tags are skipped, because Google doesn't publish them.
- Versions: every distinct published configuration this server has seen, a semantic diff between any two, and a change timeline.

**Alerts (`/alerts`)**
- Watch any property or container with an email address and an optional Slack/Teams/webhook URL (https only, SSRF-checked).
- The worker re-reads watched targets every `WATCH_INTERVAL_HOURS`. Changes are also caught whenever anyone opens the report. Each detected change is stored with a diff and delivered by webhook, and by email when `SMTP_URL` is set.
- Actions: check now, send a test webhook, remove. Each alert has a delivery log.

## Architecture

```
src/lib/compiled.ts     decode `var data = {...}` (no eval)
src/lib/ga4/parse.ts    gtag.js → Ga4Report
src/lib/gtm/parse.ts    gtm.js  → GtmContainer (tags, triggers = compiled rules, variables = macros)
src/lib/gtm/export.ts   GtmContainer → GTM import JSON
src/lib/discover.ts     URL → IDs (HTML, first-party scripts, GA4 IDs inside GTM containers)
src/lib/service.ts      fetch → parse → snapshot → diff → notify
src/lib/db.ts           SQLite: snapshots, changes, watches, notifications, rate limits
src/app/api/inspect     NDJSON stream of progress lines + result (drives the terminal UI)
src/worker/index.ts     scheduled re-checks of watched targets
```

API: `POST /api/inspect`, `GET /api/ga4/:id`, `GET /api/gtm/:id`, `GET /api/gtm/:id/export`, `GET /api/history?kind=&target=[&from=&to=]`, `GET|POST /api/watches`, `POST|DELETE /api/watches/:id`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Web + worker in watch mode |
| `npm run build && npm start` | Production web server |
| `npm run worker` | Alerts worker (run alongside the web server) |
| `npm test` | Unit tests against real captured Google responses in `tests/fixtures` |
| `npm run lint` / `npm run typecheck` | Static checks |

## Limits

- Only the latest published version is public. Version history starts when this server first reads a target.
- GTM doesn't publish tag, trigger or variable names, so names here are descriptive reconstructions.
- Values GA4 evaluates server-side, like internal-traffic IP ranges, are not in the public tag, so only rule counts are shown.
- Firebase app inspection (the "App" tab on the reference site) is not implemented.
- "My alerts" has no login. It lists alerts by email filter, so run it privately or behind auth if you expose it.

The previous TagLens implementation (Playwright scanner and dashboard) is preserved in `_backup/`.
