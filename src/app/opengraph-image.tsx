import { OG_SIZE, ogImage } from "@/lib/og";

export const alt = "TagSpy, a free website inspector";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage("home");
}
