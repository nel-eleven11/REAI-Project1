import * as admin from "firebase-admin";
import type { Doctor } from "../types/doctor";

export interface DirectoryQuery {
  page: number;
  pageSize: number;
  especialidad?: string;
  zona?: string;
}

export interface DirectoryResult {
  results: Doctor[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Firestore does not support OFFSET-based pagination efficiently, and it
 * cannot combine an inequality filter on `expires_at` with equality filters
 * on `especialidad_raw`/`zona` without a composite index per combination.
 * We keep the query simple (equality filters only, ordered by fecha_recoleccion)
 * and filter `expires_at`/`suppressed` in-memory. This is fine at the dataset
 * sizes this project targets (hundreds to low thousands of doctors) and keeps
 * the index surface small — see firestore.indexes.json.
 */
export async function queryDirectory(query: DirectoryQuery): Promise<DirectoryResult> {
  const db = admin.firestore();
  let ref: FirebaseFirestore.Query = db.collection("medicos");

  if (query.especialidad) {
    ref = ref.where("especialidad_raw", "==", query.especialidad);
  }
  if (query.zona) {
    ref = ref.where("zona", "==", query.zona);
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
