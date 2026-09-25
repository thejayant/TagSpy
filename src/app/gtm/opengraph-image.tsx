import { OG_SIZE, ogImage } from "@/lib/og";

export const alt = "GTM Container Viewer by TagSpy";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage("gtm");
}
