import { OG_SIZE, ogImage } from "@/lib/og";

export const alt = "GA4 Checker by TagSpy";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage("ga4");
}
