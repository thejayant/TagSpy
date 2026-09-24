import { checkRateLimit } from "./db";

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}

export function rateLimited(request: Request, bucket: string, perHour = Number(process.env.RATE_LIMIT_PER_HOUR ?? 120)): Response | null {
  if (checkRateLimit(`${bucket}:${clientKey(request)}`, perHour)) return null;
  return Response.json({ error: "Too many requests from this address. Try again in an hour." }, { status: 429 });
}

export function errorResponse(error: unknown, status = 400): Response {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const code = error instanceof Error && error.name === "NotPublishedError" ? 404 : status;
  return Response.json({ error: message }, { status: code });
}
