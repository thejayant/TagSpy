import type { GtmTag } from "./types";

const PRIMARY_ID_LABELS = ["Measurement ID", "Tag ID", "Conversion ID", "Tracking ID", "Advertiser ID"];

/** The one ID worth showing next to a tag in a list (measurement, conversion, pixel ID…). */
export function primaryId(tag: Pick<GtmTag, "identifiers" | "ids">): string | undefined {
  for (const label of PRIMARY_ID_LABELS) {
    const found = tag.identifiers.find((item) => item.label === label);
    if (found) return found.value;
  }
  return tag.ids[0];
}

/**
 * A short headline for list rows. Generated names repeat the trigger ("… · All Page Views"), the paused
 * state and the primary ID, which the row already shows separately, so those parts are removed.
 */
export function tagHeadline(tag: Pick<GtmTag, "name" | "identifiers" | "ids">, firstTriggerName?: string): string {
  let headline = tag.name.replace(/ \(Paused\)/, "");
  if (firstTriggerName && headline.endsWith(` · ${firstTriggerName}`)) headline = headline.slice(0, -` · ${firstTriggerName}`.length);
  const id = primaryId(tag);
  if (id) headline = headline.replace(` — ${id} / `, " — ").replace(` — ${id}`, "");
  return headline.trim() || tag.name;
}
