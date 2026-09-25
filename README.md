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

Open http://localhost:3000 for the landing page and its omnibox (or press Ctrl+K on any page). Shareable links look like `/ga4?id=G-XXXX` and `/gtm?id=GTM-XXXX&view=triggers`.

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
- History (for followed containers): every distinct published configuration seen since the follow began, a semantic diff between any two, and a change timeline.

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

**Site DNA (`/site`)**
- Enter any website to see how it's built. We read its HTML, response headers, up to ~48 JavaScript files (including chunks the bundles reference), its stylesheets, font files, public source maps, DNS and TLS certificate. Nothing is executed.
- "How it's built": a one-paragraph summary, for example "Next.js 16.2 (App Router) on React 19.3, bundled with Turbopack, Tailwind CSS, GSAP + ScrollTrigger + Lenis, React Three Fiber with 71 custom GLSL shaders, served by Vercel".
- Technology stack: about 230 signatures across frameworks, build tools, CMSs and site builders, UI and CSS frameworks, animation, smooth scroll, page transitions, 3D/WebGL, vector animation, hosting, CDNs, web servers, inferred backends, and third-party services. Each has a version when one is visible, a confidence level, and the evidence (the file and the matched snippet).
- Motion & experience: smooth scrolling, timeline and scroll-driven animation, WebGL, custom shaders, page transitions, split-text, custom cursors, fluid type, and whether the site respects reduced motion.
- Typography: every `@font-face` family with weights, styles and source (self-hosted, Google Fonts, Adobe Fonts …). Font files are opened (WOFF2/WOFF/TTF/OTF) to read the real family name, foundry, designer, version, license, glyph count, variable axes and the writing systems the font covers.
- Design tokens: color palette with CSS variable names, neutrals, type scale, `clamp()` fluid type, radii, breakpoints, dark mode, and the modern CSS features in use (container queries, `:has()`, scroll-driven animations, view transitions …).
- Infrastructure: hosting and CDN, server and `x-powered-by`, HTTP/3, compression, the TLS issuer, security headers, cookies (with what they reveal), third parties allowed by the CSP, DNS provider, mail provider, SPF senders, DMARC, and services verified with TXT records.
- Files: every file read with its size and the technologies inside it. When source maps are public, you also get the npm packages (with pnpm versions) and their source size.
- Download the report as JSON, or call `GET /api/site?url=`. Tracking IDs found on the page link to the GA4, GTM, Meta and Segment tabs.
- **Deep scan** (optional): renders the page in headless Chromium, scrolls it with real wheel events, and loads it again with "reduce motion" on. It adds exact library versions from live globals (React and React Three Fiber through a DevTools-style renderer hook, `gsap.version`, `THREE.REVISION`, `lenisVersion` …), lazy-loaded scripts, WebGL contexts, compiled shaders and draw calls, 3D/Rive/Lottie/audio/video files, fonts actually loaded, the computed type scale, running animations, scroll behaviour (native, container or scroll-jacking), a tested reduced-motion result, lab Web Vitals, network weight by type and third-party host, and a 4-frame filmstrip. Findings merge into the report with a "runtime" tag. When a site refuses plain HTTP reads but serves the browser, the report is built from the rendered page instead.
- **Follow a website**: a followed site's scans store a fingerprint (stack and versions, typefaces, top palette, hosting). History shows each version, and alerts fire on a redesign, a framework or version change, a font swap or a hosting move. Scans with failed or rate-limited files are never compared, so a missing bundle can't raise a false alert.
- **Deep scans are limited to 3 per visit** (`DEEP_SCAN_PER_VISIT`), counted on the server with an HttpOnly session cookie, plus a per-IP hourly cap (`DEEP_SCAN_PER_HOUR`) as a backstop. Scans that fail on our side are refunded.
- Every technology shows its brand mark (199 generated from open-licensed icon sets into `public/tech-icons`, via `node scripts/build-tech-icons.mjs`); the rest show a category icon.
- **Compare**: `/site?url=a.com&vs=b.com` shows both recipes side by side, the stack diff, motion signals, typefaces and palettes.
- How the deep scan runs on Vercel's free plan: [docs/site-dna-v3.md](docs/site-dna-v3.md).

**AI Website Detector (`/ai-website-detector`)**
- Enter any website to see how likely it is that it was built with AI, as a percentage, with a verdict, a confidence level, the tools it points to, and every piece of evidence (where it was found and the matched snippet).
- It reads the site the way Site DNA does and renders it in a real browser at the same time (the deep-scan browser, without the reduced-motion pass), then checks the site's root for public agent files and asks the Wayback Machine when the address was first archived. For a `*.github.io` site, or a single repository link whose name matches the site, it reads the repository's recent commits too.
- Evidence comes in tiers, strongest first: named traces (badges, generator and author tags, the builder's CDN or hosting), agent files and repository commits, template leftovers, AI coding habits, unfinished generated content, and design defaults. Evidence against AI (a site archived before ChatGPT, a classic CMS) lowers the score. Each item has a likelihood ratio; ratios combine in log-odds from a 15% prior, echoes of the same fact are discounted, weak tiers are capped, and the result stays between 2% and 98%. Rules live in `src/lib/ai/signatures.ts`.
- Detects Lovable, Bolt, v0, Replit Agent, Base44, Emergent, Anything, Google AI Studio, Same and Tempo from their fingerprints; Claude Code, Codex, Cursor, Windsurf, GitHub Copilot and Gemini CLI from public instruction files (`CLAUDE.md`, `AGENTS.md` …, checked to be coding instructions rather than, say, a store's guide for shopping agents) and commit marks.
- **One free check per person** (`AI_DETECT_PER_USER`, default 1): a year-long HttpOnly cookie, plus a lifetime cap per IP address (`AI_DETECT_PER_IP`, default 3, production only) for cleared cookies. A check only counts when it delivers a result. "Support this project" links to `NEXT_PUBLIC_SUPPORT_URL`. Optional `GITHUB_TOKEN` raises GitHub's rate limit for the repository check.
- Nothing is stored: the result lives in the response and in the visitor's tab (sessionStorage), so a reload keeps their one result.

**Alerts (`/alerts`)**
- Watch any property, container, pixel or Segment source with an email address and an optional Slack/Teams/webhook URL (https only, SSRF-checked).
- The worker re-reads watched targets every `WATCH_INTERVAL_HOURS`. Changes are also caught whenever anyone opens a followed report. Each detected change is stored with a diff and delivered by webhook, and by email when `SMTP_URL` is set.
- Actions: check now, send a test webhook, remove. Each alert has a delivery log.

## Architecture

```
src/lib/compiled.ts     decode `var data = {...}` (no eval)
src/lib/ga4/parse.ts    gtag.js → Ga4Report
src/lib/gtm/parse.ts    gtm.js  → GtmContainer (tags, triggers = compiled rules, variables = macros)
src/lib/gtm/export.ts   GtmContainer → GTM import JSON
src/lib/meta/parse.ts   Meta signals config → MetaPixelReport (rules, matching, restrictions, score)
src/lib/segment/parse.ts Segment settings → SegmentReport (destinations, plan, consent, FQL rules, score)
src/lib/site/*          Site DNA: scan.ts (fetch + budget), signatures.ts, detect.ts, fonts.ts (font files), tokens.ts, network.ts (DNS/TLS), sourcemap.ts
src/lib/ai/*            AI Website Detector: signatures.ts (rules), detect.ts (evidence + scoring), sources.ts (agent files, Wayback, GitHub), probe.ts (in-page), service.ts
src/lib/discover.ts     URL → IDs (HTML, first-party scripts, GA4 IDs and Meta pixels inside GTM containers)
src/lib/service.ts      fetch → parse → snapshot → diff → notify
src/lib/db.ts           SQLite: snapshots, changes, watches, notifications, rate limits
src/app/api/inspect     NDJSON stream of progress lines + result (drives the step checklist)
src/worker/index.ts     scheduled re-checks of watched targets
```

API: `POST /api/inspect`, `GET /api/ga4/:id`, `GET /api/gtm/:id`, `GET /api/gtm/:id/export`, `GET /api/meta/:pixelId`, `GET /api/segment/:writeKey`, `GET /api/site?url=`, `GET /api/history?kind=&target=[&from=&to=]`, `GET|POST /api/watches`, `POST|DELETE /api/watches/:id`.

## Privacy: scan data is not kept

- A report exists only in the response to the visitor who asked for it. Nothing is cached on the server (`CACHE_SECONDS` defaults to 0) and nothing is written to the database.
- Cancelling a scan aborts it on the server too (a deep scan closes its browser at once) and clears it from the page. The searched site and IDs live in the tab's session storage, which the browser erases when the tab is closed (switching tabs or reloading keeps them).
- **Follow** (history and alerts) is a planned paid feature: the buttons show "Paid · Soon" and the API refuses new follows. The code is kept; `NEXT_PUBLIC_FOLLOW_ENABLED=true` turns it on. When on, only followed targets' versions are stored; unfollowing (the last follower) deletes them, and leftover data from targets nobody follows is purged when the server starts.
- The only other rows written are rate-limit counters (per IP per hour, per visit per day). They are deleted after 48 hours.

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

- **Vercel**: import the repo, no settings needed. Without `DATABASE_URL` the database lives in `/tmp` (per-instance and short-lived). For lasting history and alerts, add a free Turso database (`DATABASE_URL=libsql://…`, `DATABASE_AUTH_TOKEN`) and `CRON_SECRET`; `vercel.json` then runs `/api/cron/watch` daily in place of the worker. Deep scans: set `DEEP_SCAN_ENABLED=true` (Chromium is downloaded once per instance; see [docs/site-dna-v3.md](docs/site-dna-v3.md)).
- **Render (free plan)**: `render.yaml` sets it up (build `npm ci && npm run build`, start `npm start`). The free disk is ephemeral, so history and alerts reset on every deploy or restart, and background workers need a paid plan.

`APP_URL` falls back to the address the host assigns (`RENDER_EXTERNAL_URL` or `VERCEL_PROJECT_PRODUCTION_URL`).

## Design

"Refract", an original glass language: frosted panes over a slow ambient light field and reticle dot grid, lit top rims, tinted glass-token icons, monospace instrument labels, soft-rectangle controls and a blue-to-violet gradient accent. Type is Sora (display), Manrope (text) and JetBrains Mono. Light and dark mode are automatic. All tokens live at the top of `src/app/globals.css`.

**Motion** is one GSAP engine for the whole site (`src/components/motion.tsx`, mounted in the root layout), driven by the classes pages already use, so a new page gets it for free:
- The hero intro is CSS (`html.intro`, switched on by a tiny script in `<head>`), so it starts the moment a hero is painted, on the first load and after every navigation, without waiting for React to hydrate. The headline leads; the rest follows.
- Reveals: blocks that arrive later (reports after a scan) and blocks below the fold rise into view, once. New nodes are hidden inside a MutationObserver callback, before the browser paints them. Stat numbers count up in their own text node (and stop if React writes a new value), and score rings draw their arc.
- Magnetic primary buttons on mouse and pen.
- Everything is skipped with `prefers-reduced-motion`. A page with its own choreography opts out with `.aid` or `data-motion="off"` (the AI Website Detector has its own GSAP scenes: the orbit lens, scramble text, the gauge).

**The landing page** (`src/app/page.tsx`, `src/components/home/*`) tells the product's story in motion:
- The headline is split into letters on the server and cascades in with CSS from the first paint.
- The X-ray stage: a specimen website in a glass browser. The cursor is an X-ray lens (a `clip-path` circle over a blueprint copy of the same page) that reads out what's under it; left alone, it tours the page element by element. Findings (GTM, GA4, Meta Pixel, stack, fonts, AI score) are wired to the element they came from: anime.js draws the wires (`createDrawable`) and sends data packets along them (`createMotionPath`), GSAP drives the lens and a 3D tilt. The frame's address bar scrambles between sites.
- Tech belts: two rows of real logos from `public/tech-icons`, looping in opposite directions and speeding up with scroll velocity.
- "One address in. Everything out.": a pinned, scroll-scrubbed GSAP scene where an address types itself in and six reports fly out of the scan (on phones and with reduced motion, a static grid).
- Glass cards everywhere catch a soft light under the cursor.
Everything pauses off screen, and with reduced motion the page is still.

**Omnibox**: the landing page hero, and a palette on every page (Ctrl+K or /, or the nav's Search button). `src/lib/intent.ts` works out what was typed (a website, a tag ID, pasted page source, a brand name, or a question), reads intent from the words around it ("fonts", "built with AI", "facebook pixel", "what does it track"), and ranks the tools for it with a reason. It always confirms before going anywhere, and a bare address never defaults to the one-run AI check. Everything runs in the browser as you type.

**Search** content lives in `src/lib/seo.ts`: for each tool, a title aimed at what people search for, the meta description and keywords, and a guide (what it shows, how it works, FAQ). `SeoGuide` renders the guide server-side under each tool, `StructuredData` emits matching schema.org data (WebApplication, FAQPage, BreadcrumbList), and `/sitemap.xml`, `/robots.txt`, canonical URLs and per-page share images (`opengraph-image.tsx`, built at compile time) come from the same source. `/` is a real landing page linking every tool.

Tags, destinations, GA4 properties and GTM containers show each vendor's real logo (Google Analytics, Tag Manager, Google Ads, Meta, Microsoft Advertising and Clarity, LinkedIn, TikTok, HubSpot and about 30 more). The marks come from `@iconify-json/logos` and `simple-icons` (both CC0) and are stored in `src/lib/brand-logos.ts`. `src/lib/brands.ts` maps vendor names to them. Vendors without an open-licensed mark get a letter badge. Trademarks belong to their owners.

## Limits

- Only the latest published version is public. Version history starts when someone follows a target.
- GTM doesn't publish tag, trigger or variable names, so names here are descriptive reconstructions.
- Values GA4 evaluates server-side, like internal-traffic IP ranges, are not in the public tag, so only rule counts are shown.
- Firebase app inspection is not implemented yet.
- The static Site DNA scan reads only what the first page load serves; the deep scan covers what loads later, but it renders once, headless, with software WebGL. Backend languages are inferred from headers and cookies.
- A Meta Pixel's public configuration covers what Meta sets up for the pixel. Events the site sends in its own code (`fbq('track', …)`), manually passed customer data, and a direct Conversions API integration (without the Gateway) are not visible, so the setup score is an estimate.
- Segment publishes only what the browser library needs: cloud-mode destinations show their name and consent category but not their settings, and server-side sources are not visible at all.
- "My alerts" has no login. It lists alerts by email filter, so run it privately or behind auth if you expose it.

The project was previously called TagLens. Existing `data/taglens.db` databases are still picked up automatically.
