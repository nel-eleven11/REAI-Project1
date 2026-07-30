import * as admin from "firebase-admin";

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 5;

/**
 * Firestore-backed rate limiter (not in-memory) specifically for
 * /correcciones, because there a removal is applied automatically and
 * immediately (suppressed=true in the same request — see the design
 * decision recorded in the project history). An in-memory counter per Cloud
 * Functions v2 instance would be nearly useless: under load the autoscaler
 * spreads requests to new instances with their own counter at zero, exactly
 * the scenario the rate limit should stop. For /directorio and
 * recolectarMedicos, protected first by the IP whitelist, the cost of a
 * global rate limiter isn't justified — it's documented as a known
 * limitation instead of being solved there (see plan.md section 11).
 *
 * Uses a transaction to avoid race conditions between reading the counter
 * and incrementing it.
 */
export async function checkRateLimit(ip: string): Promise<boolean> {
  const db = admin.firestore();
  const ref = db.collection("rate_limits").doc(ip);
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() as { count: number; window_start: number }) : null;

    if (!data || now - data.window_start >= WINDOW_MS) {
      tx.set(ref, { count: 1, window_start: now });
      return true;
    }

    if (data.count >= MAX_REQUESTS_PER_WINDOW) {
      return false;
    }

    tx.update(ref, { count: data.count + 1 });
    return true;
  });
}
