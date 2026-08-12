import type { Request } from "express";

// Two topologies coexist in this deployment (confirmed against real traffic,
// not assumed):
//
// - getDirectory/getCoverage/submitCorrection are reached through Firebase
//   Hosting rewrites (the UI calls same-origin, see public/app.js). Hosting
//   forwards the real client IP, then Cloud Functions' own GFE appends
//   Hosting's own infra IP on top — TWO trusted hops appended. Verified in
//   production: hitting the Hosting URL logged a Google-owned IP
//   (66.102.8.200) as the "last" entry, not the real client — trusting the
//   last entry here would silently identify every visitor as Google's proxy.
// - collectDoctors's routes (recolectarMedicos, runCollectionBatch) are only
//   ever invoked directly against the Cloud Function URL, never through
//   Hosting (no rewrite exists for them) — ONE trusted hop (GFE only).
//
// Everything before the trusted hops is client-supplied and spoofable.
// trustedHops must match how the specific route is actually reached, or the
// whitelist either trusts spoofable input (too few hops) or fails closed on
// legitimate traffic (too many) — the latter is the safe direction to err.
export function extractClientIp(req: Request, trustedHops: 1 | 2 = 1): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    const ips = forwardedFor
      .split(",")
      .map((ip) => ip.trim())
      .filter((ip) => ip.length > 0);
    const index = ips.length - trustedHops;
    if (index >= 0) {
      return ips[index];
    }
  }
  return req.ip ?? req.socket?.remoteAddress ?? "";
}
