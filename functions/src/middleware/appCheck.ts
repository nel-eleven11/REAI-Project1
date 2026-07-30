import * as admin from "firebase-admin";
import type { Request, Response, NextFunction } from "express";

// Defense in depth on top of the IP whitelist (plan.md section 11).
// enforce=false lets emulator/CI requests (no token available there) pass.
export function appCheckGuard(enforce: boolean) {
  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    const token = req.header("X-Firebase-AppCheck");

    if (!token) {
      if (enforce) {
        res.status(401).json({ error: "Missing App Check token" });
        return;
      }
      next();
      return;
    }

    try {
      await admin.appCheck().verifyToken(token);
      next();
    } catch (error) {
      console.warn("appCheckGuard: invalid App Check token", (error as Error).message);
      if (enforce) {
        res.status(401).json({ error: "Invalid App Check token" });
        return;
      }
      next();
    }
  };
}
