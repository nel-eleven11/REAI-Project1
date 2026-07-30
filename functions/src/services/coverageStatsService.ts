import * as admin from "firebase-admin";
import type { CoverageStats, Doctor } from "../types/doctor";

// Measures how well Places performs per zona x especialidad cell, not how
// many doctors actually exist there (plan.md section 7).
export async function computeCoverageStats(): Promise<CoverageStats[]> {
  const db = admin.firestore();
  const snapshot = await db.collection("medicos").get();

  interface Bucket {
    runIds: Set<string>;
    uniqueResults: number;
    withPhone: number;
    withWebsite: number;
  }

  const buckets = new Map<string, Bucket>();

  for (const doc of snapshot.docs) {
    const doctor = doc.data() as Doctor;
    if (!doctor.zona || !doctor.especialidad_raw) continue;

    const key = `${doctor.zona}_${doctor.especialidad_raw}`;
    if (!buckets.has(key)) {
      buckets.set(key, { runIds: new Set(), uniqueResults: 0, withPhone: 0, withWebsite: 0 });
    }
    const bucket = buckets.get(key)!;

    bucket.uniqueResults += 1;
    if (doctor.run_id) bucket.runIds.add(doctor.run_id);
    if (doctor.telefono) bucket.withPhone += 1;
    if (doctor.sitio_web) bucket.withWebsite += 1;
  }

  const computedAt = new Date().toISOString();
  const stats: CoverageStats[] = [];
  const batch = db.batch();

  for (const [key, bucket] of buckets.entries()) {
    const separatorIndex = key.indexOf("_");
    const zone = key.slice(0, separatorIndex);
    const specialty = key.slice(separatorIndex + 1);

    const stat: CoverageStats = {
      zona: zone,
      especialidad: specialty,
      searches_run: bucket.runIds.size,
      unique_results: bucket.uniqueResults,
      pct_con_telefono: Number(((bucket.withPhone / bucket.uniqueResults) * 100).toFixed(2)),
      pct_con_sitio_web: Number(((bucket.withWebsite / bucket.uniqueResults) * 100).toFixed(2)),
      computed_at: computedAt,
    };

    stats.push(stat);
    batch.set(db.collection("coverage_stats").doc(key), stat);
  }

  await batch.commit();
  return stats;
}

// Reads the precomputed collection; computeCoverageStats does the recompute.
export async function readCoverageStats(): Promise<CoverageStats[]> {
  const db = admin.firestore();
  const snapshot = await db.collection("coverage_stats").get();
  return snapshot.docs.map((doc) => doc.data() as CoverageStats);
}

