import type { Request } from "express";

// Google Cloud's external load balancer appends the verified client IP and then
// its own IP to X-Forwarded-For. Any entries before those two can be supplied by
// the client, so the penultimate entry is the trustworthy client address.
// The emulator/direct calls can contain only one address.
export function extractClientIp(req: Request): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    const ips = forwardedFor
      .split(",")
      .map((ip) => ip.trim())
      .filter((ip) => ip.length > 0);

    if (ips.length >= 2) {
      return ips[ips.length - 2];
    }
    if (ips.length === 1) {
      return ips[0];
    }
  }
  return req.ip ?? req.socket?.remoteAddress ?? "";
}
