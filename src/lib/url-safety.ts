import dns from "node:dns/promises";
import net from "node:net";

const BLOCKED_HOSTS = new Set(["localhost", "localhost.localdomain", "metadata.google.internal"]);

export function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(address)) {
    const value = address.toLowerCase().split("%")[0];
    return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") ||
      value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb") ||
      value.startsWith("ff") || value.startsWith("::ffff:127.") || value.startsWith("::ffff:10.") ||
      value === "100::" || value.startsWith("2001:db8:");
  }
  return true;
}

export async function assertSafeUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Only HTTP and HTTPS are allowed.");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host === "169.254.169.254") throw new Error("Local, private, and metadata hosts are not allowed.");
  if (process.env.SCANNER_ALLOW_PRIVATE_HOSTS === "true") return url;
  if (net.isIP(host) && isPrivateAddress(host)) throw new Error("Private and reserved IP addresses are not allowed.");
  const addresses = await dns.lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("The hostname resolves to a private or reserved address.");
  return url;
}

export async function safeFetch(url: string, init: RequestInit = {}, limits = { redirects: 4, bytes: 5_000_000 }): Promise<{ response: Response; body: string; finalUrl: string }> {
  let current = (await assertSafeUrl(url)).toString();
  for (let hop = 0; hop <= limits.redirects; hop++) {
    const response = await fetch(current, { ...init, redirect: "manual", signal: init.signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (hop === limits.redirects) throw new Error("Too many redirects.");
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirect response did not include a destination.");
      current = (await assertSafeUrl(new URL(location, current).toString())).toString();
      continue;
    }
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > limits.bytes) throw new Error("Response exceeded the scan size limit.");
    if (!response.body) return { response, body: "", finalUrl: current };
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limits.bytes) { await reader.cancel(); throw new Error("Response exceeded the scan size limit."); }
      chunks.push(value);
    }
    return { response, body: new TextDecoder().decode(Buffer.concat(chunks)), finalUrl: current };
  }
  throw new Error("Redirect validation failed.");
}
