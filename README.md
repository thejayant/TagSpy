# TagSpy

Built by [thejayant](https://thejayant.in).

See the GA4 configuration, Google Tag Manager container, Meta Pixel setup and Segment stack behind any website. Enter an ID (`G-…`, `GT-…`, `GTM-…`, a pixel ID, a Segment write key) or a website URL.

Everything comes from the public, published responses served to every visitor (Google's `gtag/js` and `gtm.js`, Meta's `signals/config/<pixel>` and Segment's `v1/projects/<write key>/settings`). The compiled JavaScript is parsed as data and never executed. No Google account is needed.

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
- Every setting opens its details in a sheet. Also: refresh, share link, per-property change history, and Follow for change alerts.

**GTM (`/gtm`)**
- A three-pane workspace (sidebar, list, inspector) with Overview, Tags, Triggers, Variables and History. Overview shows counts, destinations, IDs, weight and a health checklist whose rows open filtered lists.
- Search, filtering by type, paused-only, unused-only, no-trigger and user-defined-only filters.
- An inspector modeled on GTM's editor (docked on wide screens, a sheet on small ones):
  - Tags: identifiers, parameters with clickable `{{variable}}` references, the Custom HTML code viewer (copy/download), More and Advanced settings (priority, firing option, sequencing, consent), and firing and blocking triggers.
  - Triggers: type, "fires on all/some", conditions, listener settings, and the tags they fire or block.
  - Variables: config, custom JS, and which tags/triggers/variables use them.
- Overview also covers where data goes (vendor groups with IDs, including Custom HTML vendors like Meta Pixel and Clarity), and breakdowns by tag, trigger and variable type.
- **Download as a Tag Manager import file** (`exportFormatVersion: 2`). Paused tags carry no parameters, and custom-template tags are skipped, because Google doesn't publish them.
- History: every distinct published configuration this server has seen, a semantic diff between any two, and a change timeline.

**Meta Pixel (`/meta`)**
- Enter a pixel ID, a GTM container or a website. Pixels are found in the page and inside GTM containers (Custom HTML and the Meta template).
- Signal setup score (0–100) with the checks behind it and the biggest gain.
- Codeless events: every Event Setup Tool rule decoded into a sentence ("When a visitor clicks a button whose text equals "submit", send Purchase"), grouped by event.
- Advanced matching fields, Conversions API Gateway, first-party cookies, click IDs captured (fbclid, AEM brid, WhatsApp waaem), iOS measurement bridge.
- Blocked URL parameters and custom data per event, restricted and unverified events, prohibited sources.
- Every pixel feature Meta loads, explained; Meta's rollout flags for the pixel; the raw configuration as JSON.
- History, change diffs and alerts, like GA4 and GTM.

**Segment (`/segment`)**
- Enter a write key or a website. Keys are found in the page, in first-party scripts (including `analytics.load(variable)` indirection) and inside GTM containers.
- Where data flows: a live map of website → Segment → every destination, grouped by role (advertising, analytics, marketing & CRM, personalization, sales intelligence, support, warehouses), with real logos and browser (device mode), server (cloud mode) or Actions badges.
- Each destination opens its IDs (GA4 measurement IDs, GTM containers and Meta pixels link straight to their TagSpy reports), consent categories, rules, Actions mappings and public settings.
- Tracking plan: whether unplanned events are blocked, every planned event with per-destination overrides, identify and group traits.
- Consent and rules: tools per consent category, tools with no consent category, and every consent gate and destination filter (Segment FQL) written as a sentence.
- Library: Analytics.js 2.0, version, event endpoint (US, EU or a first-party proxy), metrics sampling, auto-instrumentation, edge functions and middleware.
- Data governance score, plain-language insights, when the settings were last published, raw JSON, history, diffs and alerts.

GA4, Tag Manager, Meta and Segment link to each other: the site you searched and the IDs found travel with the tabs, and each report lists the related property, container or pixel.

**Alerts (`/alerts`)**
- Watch any property, container, pixel or Segment source with an email address and an optional Slack/Teams/webhook URL (https only, SSRF-checked).
- The worker re-reads watched targets every `WATCH_INTERVAL_HOURS`. Changes are also caught whenever anyone opens the report. Each detected change is stored with a diff and delivered by webhook, and by email when `SMTP_URL` is set.
- Actions: check now, send a test webhook, remove. Each alert has a delivery log.

## Architecture

```
src/lib/compiled.ts     decode `var data = {...}` (no eval)
src/lib/ga4/parse.ts    gtag.js → Ga4Report
src/lib/gtm/parse.ts    gtm.js  → GtmContainer (tags, triggers = compiled rules, variables = macros)
src/lib/gtm/export.ts   GtmContainer → GTM import JSON
src/lib/meta/parse.ts   Meta signals config → MetaPixelReport (rules, matching, restrictions, score)
src/lib/segment/parse.ts Segment settings → SegmentReport (destinations, plan, consent, FQL rules, score)
src/lib/discover.ts     URL → IDs (HTML, first-party scripts, GA4 IDs and Meta pixels inside GTM containers)
src/lib/service.ts      fetch → parse → snapshot → diff → notify
src/lib/db.ts           SQLite: snapshots, changes, watches, notifications, rate limits
src/app/api/inspect     NDJSON stream of progress lines + result (drives the step checklist)
src/worker/index.ts     scheduled re-checks of watched targets
```

API: `POST /api/inspect`, `GET /api/ga4/:id`, `GET /api/gtm/:id`, `GET /api/gtm/:id/export`, `GET /api/meta/:pixelId`, `GET /api/segment/:writeKey`, `GET /api/history?kind=&target=[&from=&to=]`, `GET|POST /api/watches`, `POST|DELETE /api/watches/:id`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Web + worker in watch mode |
| `npm run build && npm start` | Production web server |
| `npm run worker` | Alerts worker (run alongside the web server) |
| `npm test` | Unit tests against real captured Google responses in `tests/fixtures` |
| `npm run lint` / `npm run typecheck` | Static checks |

## Deploy

Every variable is optional, and a blank value counts as unset, so a dashboard full of empty keys still gets the defaults.

- **Vercel**: import the repo, no settings needed. The database lives in `/tmp` (the only writable path), so history and alerts are per-instance and short-lived, and the worker does not run.
- **Render (free plan)**: `render.yaml` sets it up (build `npm ci && npm run build`, start `npm start`). The free disk is ephemeral, so history and alerts reset on every deploy or restart, and background workers need a paid plan.

`APP_URL` falls back to the address the host assigns (`RENDER_EXTERNAL_URL` or `VERCEL_PROJECT_PRODUCTION_URL`).

## Design

"Refract", an original glass language: frosted panes over a slow ambient light field and reticle dot grid, lit top rims, tinted glass-token icons, monospace instrument labels, soft-rectangle controls and a blue-to-violet gradient accent. Type is Sora (display), Manrope (text) and JetBrains Mono. Light and dark mode are automatic. All tokens live at the top of `src/app/globals.css`.

Tags, destinations, GA4 properties and GTM containers show each vendor's real logo (Google Analytics, Tag Manager, Google Ads, Meta, Microsoft Advertising and Clarity, LinkedIn, TikTok, HubSpot and about 30 more). The marks come from `@iconify-json/logos` and `simple-icons` (both CC0) and are stored in `src/lib/brand-logos.ts`. `src/lib/brands.ts` maps vendor names to them. Vendors without an open-licensed mark get a letter badge. Trademarks belong to their owners.

## Limits

- Only the latest published version is public. Version history starts when this server first reads a target.
- GTM doesn't publish tag, trigger or variable names, so names here are descriptive reconstructions.
- Values GA4 evaluates server-side, like internal-traffic IP ranges, are not in the public tag, so only rule counts are shown.
- Firebase app inspection (the "Apps" tab) is not implemented yet.
- A Meta Pixel's public configuration covers what Meta sets up for the pixel. Events the site sends in its own code (`fbq('track', …)`), manually passed customer data, and a direct Conversions API integration (without the Gateway) are not visible, so the setup score is an estimate.
- Segment publishes only what the browser library needs: cloud-mode destinations show their name and consent category but not their settings, and server-side sources are not visible at all.
- "My alerts" has no login. It lists alerts by email filter, so run it privately or behind auth if you expose it.

The project was previously called TagLens. Existing `data/taglens.db` databases are still picked up automatically.
