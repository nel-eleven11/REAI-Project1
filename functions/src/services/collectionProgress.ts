import * as admin from "firebase-admin";

function progressDoc(): FirebaseFirestore.DocumentReference {
  return admin.firestore().collection("collection_progress").doc("state");
}

export interface ClaimedBatch {
  startIndex: number;
  endIndex: number;
}

// Atomically reads the cursor and advances it past the claimed range, so two
// overlapping invocations (retry, double manual trigger) can't both read the
// same startIndex and duplicate work/API calls.
export async function claimNextBatch(batchSize: number, totalLength: number): Promise<ClaimedBatch | null> {
  const db = admin.firestore();

  return db.runTransaction(async (tx) => {
    const ref = progressDoc();
    const snap = await tx.get(ref);
    const startIndex = snap.exists ? (snap.data()?.next_index as number) : 0;

    if (startIndex >= totalLength) {
      return null;
    }

    const endIndex = Math.min(startIndex + batchSize, totalLength);
    tx.set(ref, { next_index: endIndex, updated_at: new Date().toISOString() });
    return { startIndex, endIndex };
  });
}
