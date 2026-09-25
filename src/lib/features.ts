/**
 * Follow (version history, change detection and alerts) is a planned paid feature. The code stays in place but is
 * switched off until plans exist; NEXT_PUBLIC_FOLLOW_ENABLED=true turns it on (e.g. to test it). Read on both server
 * and client, so the API refuses new follows when the UI hides them.
 */
export const FOLLOW_ENABLED = process.env.NEXT_PUBLIC_FOLLOW_ENABLED === "true";

/** What Follow will include, shown wherever it is advertised. */
export const FOLLOW_PERKS = [
  "Daily re-checks of GA4 properties, Tag Manager containers, Meta pixels, Segment sources and websites",
  "Every published version kept, with a diff between any two",
  "Alerts by email, Slack, Teams or webhook when something changes (a new tag, a redesign, a framework or font swap)",
];
