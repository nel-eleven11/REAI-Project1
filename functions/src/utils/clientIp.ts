import type { Request } from "express";

// GFE appends the real IP as the LAST x-forwarded-for entry; earlier ones are client-spoofable.
export function extractClientIp(req: Request): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    const ips = forwardedFor.split(",").map((ip) => ip.trim());
    return ips[ips.length - 1];
  }
  return req.ip ?? req.socket?.remoteAddress ?? "";
}
