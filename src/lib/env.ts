// Hosting dashboards (Vercel, Render) often hold variables that exist but are blank, so blank counts as unset.

export function envString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function envNumber(name: string, fallback: number): number {
  const value = Number(envString(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Public URL of this app: APP_URL, else the address the host assigns, else localhost. */
export function appUrl(): string {
  const vercel = envString("VERCEL_PROJECT_PRODUCTION_URL");
  const url = envString("APP_URL") ?? envString("RENDER_EXTERNAL_URL") ?? (vercel ? `https://${vercel}` : "http://localhost:3000");
  return url.replace(/\/$/, "");
}
