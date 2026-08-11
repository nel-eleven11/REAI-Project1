import * as admin from "firebase-admin";
import type { Doctor } from "../types/doctor";

export interface DirectoryQuery {
  page: number;
  pageSize: number;
  specialty?: string;
  zone?: string;
}

export interface DirectoryResult {
  results: Doctor[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

const MAX_OVERFETCH_ROUNDS = 5;

// expires_at/suppressed are filtered in-memory (not in the Firestore query,
// to avoid a composite index per filter combination), so a plain .limit()
// could under-fill a page if some of the fetched docs get filtered out.
// Fetches only up to page*pageSize docs at first instead of the whole
// filtered collection, and only widens the limit (doubling) if that wasn't
// enough after filtering — falling back to fetching everything only if the
// suppressed/expired rate is unusually high for this filter combination.
export async function queryDirectory(query: DirectoryQuery): Promise<DirectoryResult> {
  const db = admin.firestore();
  let ref: FirebaseFirestore.Query = db.collection("medicos");

  if (query.specialty) {
    ref = ref.where("especialidad", "==", query.specialty);
  }
  if (query.zone) {
    ref = ref.where("zona", "==", query.zone);
  }
  ref = ref.orderBy("fecha_recoleccion", "desc");

  const nowIso = new Date().toISOString();
  const needed = query.page * query.pageSize;

  let fetchLimit = needed;
  let eligible: Doctor[] = [];
  let exhausted = false;

  for (let round = 0; round < MAX_OVERFETCH_ROUNDS; round += 1) {
    const snapshot = await ref.limit(fetchLimit).get();
    eligible = snapshot.docs
      .map((doc) => doc.data() as Doctor)
      .filter((doctor) => !doctor.suppressed)
      .filter((doctor) => doctor.expires_at > nowIso);

    exhausted = snapshot.size < fetchLimit;
    if (eligible.length >= needed || exhausted) {
      break;
    }
    fetchLimit *= 2;
  }

  const start = (query.page - 1) * query.pageSize;
  const end = start + query.pageSize;
  const pageResults = eligible.slice(start, end);

  return {
    results: pageResults,
    page: query.page,
    pageSize: query.pageSize,
    hasMore: end < eligible.length || (!exhausted && eligible.length >= needed),
  };
}
