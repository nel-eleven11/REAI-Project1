import * as admin from "firebase-admin";

function progressDoc(): FirebaseFirestore.DocumentReference {
  return admin.firestore().collection("collection_progress").doc("state");
}

export async function getNextIndex(): Promise<number> {
  const snap = await progressDoc().get();
  return snap.exists ? (snap.data()?.next_index as number) : 0;
}

export async function advanceNextIndex(newIndex: number): Promise<void> {
  await progressDoc().set({ next_index: newIndex, updated_at: new Date().toISOString() });
}
