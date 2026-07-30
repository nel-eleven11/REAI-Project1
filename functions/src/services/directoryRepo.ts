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

// expires_at/suppressed are filtered in-memory, not in the Firestore query,
// to avoid a composite index per filter combination — fine at this dataset size.
export async function queryDirectory(query: DirectoryQuery): Promise<DirectoryResult> {
  const db = admin.firestore();
  let ref: FirebaseFirestore.Query = db.collection("medicos");

  if (query.specialty) {
    ref = ref.where("especialidad_raw", "==", query.specialty);
  }
  if (query.zone) {
    ref = ref.where("zona", "==", query.zone);
  }
  ref = ref.orderBy("fecha_recoleccion", "desc");

  const snapshot = await ref.get();
  const nowIso = new Date().toISOString();

  const eligible = snapshot.docs
    .map((doc) => doc.data() as Doctor)
    .filter((doctor) => !doctor.suppressed)
    .filter((doctor) => doctor.expires_at > nowIso);

  const start = (query.page - 1) * query.pageSize;
  const end = start + query.pageSize;
  const pageResults = eligible.slice(start, end);

  return {
    results: pageResults,
    page: query.page,
    pageSize: query.pageSize,
    hasMore: end < eligible.length,
  };
}
