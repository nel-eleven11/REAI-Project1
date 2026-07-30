import type { Request, Response, NextFunction } from "express";
import { logAccess } from "../services/accessLog";

function parseWhitelist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((ip) => ip.trim())
      .filter((ip) => ip.length > 0)
  );
}

function extractClientIp(req: Request): string {
  // Cloud Run/Cloud Functions gen2 sit behind Google's GFE, which APPENDS the
  // real connecting IP as the LAST entry of x-forwarded-for. Everything before
  // that is client-supplied and spoofable — trusting the first entry would let
  // an attacker bypass the whitelist by just sending a fake header.
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    const ips = forwardedFor.split(",").map((ip) => ip.trim());
    return ips[ips.length - 1];
  }
  return req.ip ?? req.socket?.remoteAddress ?? "";
}

export function ipWhitelist(allowedIpsEnv: string | undefined) {
  const allowedIps = parseWhitelist(allowedIpsEnv);

  return function (req: Request, res: Response, next: NextFunction): void {
    const clientIp = extractClientIp(req);
    const ruta = req.originalUrl;

    // Logged on 'finish' (not here) so the recorded resultado is the real
    // status code sent to the client, including whatever the route handler
    // itself returns after next() — not just the whitelist's own 403.
    res.on("finish", () => {
      void logAccess(clientIp, ruta, res.statusCode);
    });

    if (!allowedIps.has(clientIp)) {
      res.status(403).json({ error: "Forbidden", ip: clientIp });
      return;
    }

    next();
  };
}
