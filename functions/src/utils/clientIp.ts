import type { Request } from "express";

// This project deploys directly to Cloud Functions/Cloud Run URLs
// (*.cloudfunctions.net) with NO External HTTPS Load Balancer in front —
// see plan.md section 11, Cloud Armor is listed as an optional alternative
// that was never set up. In that direct-deploy topology, Google's GFE
// appends exactly ONE IP: the real client's, as the LAST entry of
// x-forwarded-for. Everything before that is client-supplied and
// spoofable — trusting anything but the last entry lets an attacker
// impersonate a whitelisted IP by putting it earlier in a fake header.
//
// If an External HTTPS Load Balancer is ever added in front of Cloud Run
// (extra hop), this needs to change to the second-to-last entry instead —
// don't "fix" this back without first confirming which topology is deployed.
export function extractClientIp(req: Request): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    const ips = forwardedFor
      .split(",")
      .map((ip) => ip.trim())
      .filter((ip) => ip.length > 0);
    if (ips.length > 0) {
      return ips[ips.length - 1];
    }
  }
  return req.ip ?? req.socket?.remoteAddress ?? "";
}
