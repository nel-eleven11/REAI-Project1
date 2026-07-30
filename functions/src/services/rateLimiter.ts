import * as admin from "firebase-admin";

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 5;

// Firestore-backed (not in-memory) so it holds across Cloud Functions
// instances — /correcciones has no IP whitelist and applies removals
// immediately, so a per-instance counter would be trivial to bypass
// (plan.md section 11).
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
