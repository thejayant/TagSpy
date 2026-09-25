# Site DNA v3: deep scan, redesign alerts and compare

v1 and v2 read what a site serves on first load (HTML, headers, bundles, CSS, font files, source maps, DNS, TLS) without executing anything. v3 adds three things:

1. **Deep scan:** the page is rendered in headless Chromium to capture what only exists at runtime.
2. **Follow a website:** fingerprints, history, diffs and alerts, like the GA4/GTM/Meta/Segment tabs.
3. **Compare:** `/site?url=a.com&vs=b.com`.

Everything is built to run on the Vercel free (Hobby) plan: 60 s functions, one browser per instance, and a once-a-day scheduled job. Check current plan quotas in your Vercel dashboard, because they change.

## Deep scan

`POST /api/site/deep { url }` streams NDJSON progress, then the merged report. `GET /api/site/deep` tells the UI whether deep scans are available and why not.

What happens (`src/lib/site/render.ts`, `probes.ts`, `merge.ts`):

| Step | Detail |
| --- | --- |
| Static scan, in parallel | The existing scan (nothing is cached, so it reruns). If the site refuses plain HTTP clients but serves the browser, the static part is rebuilt from the rendered HTML instead. |
| Probes before any page script | Wraps `getContext` / `shaderSource` / draw calls (WebGL contexts, shaders, draw calls), `navigator.gpu.requestAdapter` (WebGPU), and `addEventListener` (wheel listeners). Installs a stand-in React DevTools hook, so React and React Three Fiber report their renderer and exact version. Adds PerformanceObservers for LCP, CLS and long tasks. |
| Load | `waitUntil: load` (at most 25 s), then network idle. Web Vitals are captured **before** scrolling, so the scripted scroll doesn't inflate CLS or blocking time. |
| Scroll | Real wheel events in 3 steps, so Lenis/Locomotive react as they would for a visitor. A screenshot is taken at each step (JPEG). |
| Collect | Live globals and versions (GSAP, ScrollTrigger, three.js, Lenis, Next.js, Vue, Svelte, jQuery, Pixi, Babylon, Lottie, Rive, Alpine, htmx, Spline …), `document.fonts`, computed type for h1–h3/p/a/button/li, `document.getAnimations()`, scroll behaviour (native, a scroll container such as a Lenis wrapper, or real scroll-jacking), and the rendered DOM. |
| Reduced motion | If at least 14 s remain, the page loads again with `prefers-reduced-motion: reduce`. Running animations and smooth scrolling are compared with the first load. |
| Signatures | The same 237 signatures run over every script and stylesheet the page actually loaded, including lazy chunks the static scan could not see. |
| Merge | Versions from live globals win over bundle guesses. Technologies found only at runtime are tagged `runtime`. Motion signals, the summary, insights and limits are updated. |

**Budget:** `DEEP_SCAN_SECONDS` (default 50) on a 60 s function. Steps are skipped when time runs short, and the report is marked `partial`.

**Safety:**
- Every request the page makes (including redirects) is checked against private, loopback, link-local and metadata addresses.
- Non-HTTP schemes are refused.
- Audio and video are listed but not downloaded.
- Downloads are denied, and WebRTC can't leak local addresses.
- Each scan gets a fresh incognito context; cookies and consent banners are never touched.
- Only one scan runs per instance at a time.
- A separate rate limit applies (`DEEP_SCAN_PER_HOUR`, default 10 per IP).
- Bot-protection challenges are reported, never solved.

**Known limit:** Chromium resolves DNS itself after the guard's own lookup, so a DNS-rebinding host could in theory answer differently the second time. The guard still blocks every host that resolves privately at check time.

### Browser providers

| Provider | When | Notes |
| --- | --- | --- |
| `cloudflare` | `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` are set. If Cloudflare is at its limit or unreachable, the next available provider takes over automatically. | Cloudflare Browser Run over CDP (`wss://api.cloudflare.com/client/v4/accounts/<id>/browser-rendering/devtools/browser`). The browser runs on Cloudflare, so the Vercel function only drives it: no Chromium download and no memory pressure. Workers Free: 10 browser-minutes a day and 3 concurrent browsers. Workers Paid: 10 hours a month, then $0.09 per hour. The token needs the "Browser Rendering - Edit" permission. |
| `remote` | `BROWSER_WS_ENDPOINT` is set | Any Chrome DevTools Protocol WebSocket, such as Browserless or a self-hosted `browserless/chromium` container. The most reliable option for heavy WebGL sites. |
| `local` | Chrome/Edge/Chromium found, or `CHROME_PATH` | Development machines and Docker images with Chrome. |
| `serverless` | Vercel/Lambda, or Linux x64 without a browser | `@sparticuz/chromium-min`. The Chromium pack (~70 MB) downloads once per instance into `/tmp` from `CHROMIUM_PACK_URL` (default: the matching GitHub release). For faster cold starts, host the tar on Vercel Blob in your function's region. |

In production, deep scans stay off until `DEEP_SCAN_ENABLED=true`.

### Vercel setup

1. Set `DEEP_SCAN_ENABLED=true`. Optionally set `CHROMIUM_PACK_URL` to a copy of `chromium-v153.0.0-pack.x64.tar` hosted on Vercel Blob.
2. Keep Fluid compute on (the default), so warm instances reuse the unpacked Chromium.
3. `puppeteer-core` and `@sparticuz/chromium-min` are in `serverExternalPackages` (next.config.ts), so they are traced into the function rather than bundled.
4. If cold starts plus heavy pages keep ending `partial`, point `BROWSER_WS_ENDPOINT` at a hosted browser. The code path is the same.

Render's free plan (512 MB) is too small for Chromium. Use `BROWSER_WS_ENDPOINT` there.

## Follow a website

- Scans of a **followed** site store a **fingerprint** (`src/lib/site/fingerprint.ts`) under the site address (`host/path`: host lower-cased without `www`, path case kept). It contains technologies (no implied ones, no runtime-only ones, versions without pre-release suffixes), typefaces, the top 12 colors and hosting. Timings and sizes are excluded, so an unchanged site never "changes".
- `diffSite` reports stack additions and removals, version changes, font swaps, hosting moves, and a palette shift when fewer than half of the top colors survive.
- **Incomplete scans are never compared.** A scan where files failed for transient reasons (network errors, timeouts, 403/429/5xx) or that ran out of time is not stored. During testing, a rate-limited rescan dropped six bundles and would otherwise have reported React and three.js as "removed". Stable 404s don't count as failures. Scheduled checks mark such a run as an error and retry next time.
- Deep-scan results are not stored as snapshots, so switching between static and deep scans can't flap.

### Persistence and scheduling on Vercel

- `/tmp` SQLite is per instance, so history and alerts need a hosted database. Set `DATABASE_URL` (Turso/libSQL, `libsql://…`) and `DATABASE_AUTH_TOKEN`. `src/lib/db.ts` switches to the HTTP libSQL client (no native binary in the function), runs the same schema, and uses the same queries. The storage layer is async and transaction-free: snapshots use `INSERT OR IGNORE` on the unique hash, and rate limits use one `INSERT … ON CONFLICT … RETURNING count`.
- `vercel.json` schedules `GET /api/cron/watch` daily (06:00 UTC). Vercel signs the request with `CRON_SECRET`; without the secret, the route refuses. Each run checks due targets for about 50 s, least recently checked first, so long lists rotate across days. The Node worker (`npm run worker`) uses the same `runDueChecks`.

## Compare

`/site?url=a.com&vs=b.com` (or "Compare with…" under a report) runs both static scans and shows:
- both summaries
- an at-a-glance table (technology count, JS/CSS weight, fonts, shaders, custom properties, hosting)
- the stack by group, with versions and differences highlighted
- motion signals
- typefaces and palettes

## Limits and privacy

- **Deep scans per visit:** 3 (`DEEP_SCAN_PER_VISIT`). They are counted on the server against an HttpOnly session cookie, with a per-IP hourly cap (`DEEP_SCAN_PER_HOUR`) as a backstop. Scans that fail on our side (no browser, server busy, Cloudflare quota) are refunded; a cancelled scan still counts.
- **Nothing is stored:** deep-scan results are never stored, and static scans are stored only for followed targets. Cancelling aborts the server work and closes the browser.

## Not built, on purpose

- **Frame-rate or GPU timing numbers:** headless Chromium renders WebGL in software, so they would mislead. The UI labels all runtime metrics as lab values.
