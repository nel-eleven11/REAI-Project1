import * as admin from "firebase-admin";
import type { CoverageStats, Doctor } from "../types/doctor";

/**
 * Coverage and bias audit (plan.md section 7): for each zona x especialidad
 * cell, measures how many unique records exist and what percentage has a
 * phone/website. It does not measure "how many doctors there are", it
 * measures how well the source (Google Places) performs per cell — the
 * digital divide shows up in cells with few results and low contact %.
 *
 * "searches_run" is approximated by counting unique run_ids that touched
 * that zona+especialidad, since recording it directly would require
 * changing collection_runs to store especialidad (out of scope for this
 * iteration); this approximation is documented explicitly.
 */
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
    // place_id-only purged docs no longer have zona/especialidad_raw — skip.
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
    const zona = key.slice(0, separatorIndex);
    const especialidad = key.slice(separatorIndex + 1);

    const stat: CoverageStats = {
      zona,
      especialidad,
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
