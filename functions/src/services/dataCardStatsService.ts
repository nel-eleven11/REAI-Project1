import * as admin from "firebase-admin";
import type { CollectionRun, CoverageStats, Doctor } from "../types/doctor";

export interface DataCardStats {
  total_active_doctors: number;
  total_suppressed: number;
  by_specialty: Record<string, number>;
  zones_with_data: number;
  total_zones: number;
  coverage_cells_populated: number;
  coverage_cells_total: number;
  avg_pct_telefono: number;
  avg_pct_sitio_web: number;
  lowest_coverage_cells: Array<{ zona: string; especialidad: string; unique_results: number; searches_run: number }>;
  total_collection_runs: number;
  total_api_calls: number;
  total_estimated_cost_usd: number;
  earliest_collection: string | null;
  latest_collection: string | null;
}

export async function computeDataCardStats(): Promise<DataCardStats> {
  const db = admin.firestore();

  const [medicosSnap, coverageSnap, runsSnap] = await Promise.all([
    db.collection("medicos").get(),
    db.collection("coverage_stats").get(),
    db.collection("collection_runs").get(),
  ]);

  let totalActive = 0;
  let totalSuppressed = 0;
  const bySpecialty: Record<string, number> = {};
  const zones = new Set<string>();
  let earliest: string | null = null;
  let latest: string | null = null;

  for (const doc of medicosSnap.docs) {
    const doctor = doc.data() as Doctor;
    if (doctor.suppressed) {
      totalSuppressed += 1;
      continue;
    }
    if (!doctor.nombre) continue; // purged doc, only place_id left

    totalActive += 1;
    if (doctor.especialidad) {
      bySpecialty[doctor.especialidad] = (bySpecialty[doctor.especialidad] ?? 0) + 1;
    }
    if (doctor.zona) zones.add(doctor.zona);
    if (doctor.fecha_recoleccion) {
      if (!earliest || doctor.fecha_recoleccion < earliest) earliest = doctor.fecha_recoleccion;
      if (!latest || doctor.fecha_recoleccion > latest) latest = doctor.fecha_recoleccion;
    }
  }

  const cells = coverageSnap.docs.map((doc) => doc.data() as CoverageStats);
  const populatedCells = cells.filter((c) => c.unique_results > 0);
  const avgPhone = populatedCells.length
    ? populatedCells.reduce((sum, c) => sum + c.pct_con_telefono, 0) / populatedCells.length
    : 0;
  const avgWebsite = populatedCells.length
    ? populatedCells.reduce((sum, c) => sum + c.pct_con_sitio_web, 0) / populatedCells.length
    : 0;

  const lowest = [...cells]
    .sort((a, b) => a.unique_results - b.unique_results)
    .slice(0, 10)
    .map((c) => ({ zona: c.zona, especialidad: c.especialidad, unique_results: c.unique_results, searches_run: c.searches_run }));

  const runs = runsSnap.docs.map((doc) => doc.data() as CollectionRun);
  const totalApiCalls = runs.reduce((sum, r) => sum + (r.api_calls ?? 0), 0);
  const totalCost = runs.reduce((sum, r) => sum + (r.estimated_cost_usd ?? 0), 0);

  return {
    total_active_doctors: totalActive,
    total_suppressed: totalSuppressed,
    by_specialty: bySpecialty,
    zones_with_data: zones.size,
    total_zones: 18,
    coverage_cells_populated: populatedCells.length,
    coverage_cells_total: cells.length,
    avg_pct_telefono: Number(avgPhone.toFixed(2)),
    avg_pct_sitio_web: Number(avgWebsite.toFixed(2)),
    lowest_coverage_cells: lowest,
    total_collection_runs: runs.length,
    total_api_calls: totalApiCalls,
    total_estimated_cost_usd: Number(totalCost.toFixed(2)),
    earliest_collection: earliest,
    latest_collection: latest,
  };
}
