import * as admin from "firebase-admin";
import type { Request, Response, NextFunction } from "express";

/**
 * Firebase App Check verification (plan.md section 11, "defense in depth").
 * The IP whitelist alone is documented as insufficient — App Check adds a
 * second, independent signal (a valid attestation token from the real UI,
 * not just "the right network").
 *
 * Controlled by APP_CHECK_ENFORCE=true|false so:
 *  - existing emulator/CI tests (which don't send the header) keep passing
 *    by default, since App Check tokens require a live reCAPTCHA site key
 *    that isn't available in CI.
 *  - it can be turned on per-environment once a real site key is
 *    configured in the Firebase console (see README "App Check setup").
 *
 * When enforcement is off, the middleware still verifies the token IF one
 * is present and logs a warning on failure, so it can be exercised in the
 * emulator without blocking anything.
 */
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
