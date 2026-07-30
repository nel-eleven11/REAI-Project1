import * as admin from "firebase-admin";
import type { CollectionRun, CoverageStats, Doctor } from "../types/doctor";

interface ResultsBucket {
  uniqueResults: number;
  withPhone: number;
  withWebsite: number;
}

// Measures how well Places performs per zona x especialidad cell, not how
// many doctors actually exist there (plan.md section 7). searches_run comes
// from collection_runs (every invocation, including zero-result ones) so a
// zone genuinely searched-but-empty is distinguishable from one never
// searched — that distinction is the whole point of the bias audit.
export async function computeCoverageStats(): Promise<CoverageStats[]> {
  const db = admin.firestore();

  const searchesRunByKey = await countSearchesRunByKey(db);
  const resultsByKey = await bucketResultsByKey(db);

  const keys = new Set([...searchesRunByKey.keys(), ...resultsByKey.keys()]);
  const computedAt = new Date().toISOString();
  const stats: CoverageStats[] = [];
  const batch = db.batch();

  for (const key of keys) {
    const separatorIndex = key.indexOf("_");
    const zone = key.slice(0, separatorIndex);
    const specialty = key.slice(separatorIndex + 1);
    const results = resultsByKey.get(key) ?? { uniqueResults: 0, withPhone: 0, withWebsite: 0 };

    const stat: CoverageStats = {
      zona: zone,
      especialidad: specialty,
      searches_run: searchesRunByKey.get(key) ?? 0,
      unique_results: results.uniqueResults,
      pct_con_telefono: results.uniqueResults > 0 ? Number(((results.withPhone / results.uniqueResults) * 100).toFixed(2)) : 0,
      pct_con_sitio_web: results.uniqueResults > 0 ? Number(((results.withWebsite / results.uniqueResults) * 100).toFixed(2)) : 0,
      computed_at: computedAt,
    };

    stats.push(stat);
    batch.set(db.collection("coverage_stats").doc(key), stat);
  }

  await batch.commit();
  return stats;
}

async function countSearchesRunByKey(db: FirebaseFirestore.Firestore): Promise<Map<string, number>> {
  const snapshot = await db.collection("collection_runs").get();
  const counts = new Map<string, number>();

  for (const doc of snapshot.docs) {
    const run = doc.data() as CollectionRun;
    if (!run.zona || !run.especialidad) continue;
    const key = `${run.zona}_${run.especialidad}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

// Excludes suppressed doctors: a removal request means their data shouldn't
// count toward aggregate stats either, not just the public directory.
async function bucketResultsByKey(db: FirebaseFirestore.Firestore): Promise<Map<string, ResultsBucket>> {
  const snapshot = await db.collection("medicos").get();
  const buckets = new Map<string, ResultsBucket>();

  for (const doc of snapshot.docs) {
    const doctor = doc.data() as Doctor;
    if (!doctor.zona || !doctor.especialidad_raw || doctor.suppressed) continue;

    const key = `${doctor.zona}_${doctor.especialidad_raw}`;
    if (!buckets.has(key)) {
      buckets.set(key, { uniqueResults: 0, withPhone: 0, withWebsite: 0 });
    }
    const bucket = buckets.get(key)!;

    bucket.uniqueResults += 1;
    if (doctor.telefono) bucket.withPhone += 1;
    if (doctor.sitio_web) bucket.withWebsite += 1;
  }

  return buckets;
}

// Reads the precomputed collection; computeCoverageStats does the recompute.
export async function readCoverageStats(): Promise<CoverageStats[]> {
  const db = admin.firestore();
  const snapshot = await db.collection("coverage_stats").get();
  return snapshot.docs.map((doc) => doc.data() as CoverageStats);
}
