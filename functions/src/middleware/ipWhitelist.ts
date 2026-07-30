import type { Request, Response, NextFunction } from "express";
import { logAccess } from "../services/accessLog";
import { extractClientIp } from "../utils/clientIp";

function parseWhitelist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((ip) => ip.trim())
      .filter((ip) => ip.length > 0)
  );
}

export function ipWhitelist(allowedIpsEnv: string | undefined) {
  const allowedIps = parseWhitelist(allowedIpsEnv);

  return function (req: Request, res: Response, next: NextFunction): void {
    const clientIp = extractClientIp(req);
    const route = req.originalUrl;

    // 'finish' records the real status the handler sends, not just this 403.
    res.on("finish", () => {
      void logAccess(clientIp, route, res.statusCode);
    });

    if (!allowedIps.has(clientIp)) {
      res.status(403).json({ error: "Forbidden", ip: clientIp });
      return;
    }

    next();
  };
}
