import { OG_SIZE, ogImage } from "@/lib/og";

export const alt = "Site DNA by TagSpy: see how any website is built";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage("site");
}
