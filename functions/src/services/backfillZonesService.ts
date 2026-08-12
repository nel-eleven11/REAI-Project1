import * as admin from "firebase-admin";
import type { Doctor } from "../types/doctor";
import { extractZone } from "./zoneExtractor";

export interface BackfillSummary {
  scanned: number;
  updated: number;
  unchanged: number;
}

// One-time reprocessing for docs written before zona_raw/zona_normalizada
// existed: re-derives the effective zona from the already-stored direccion.
// No Places API call needed — the address is already in Firestore.
export async function backfillZones(): Promise<BackfillSummary> {
  const db = admin.firestore();
  const snapshot = await db.collection("medicos").get();

  const summary: BackfillSummary = { scanned: snapshot.size, updated: 0, unchanged: 0 };
  let batch = db.batch();
  let pending = 0;

  for (const doc of snapshot.docs) {
    const doctor = doc.data() as Doctor;
    if (!doctor.direccion) continue;

    const searchedZone = doctor.zona_raw ?? doctor.zona;
    const extractedZone = extractZone(doctor.direccion);
    const effectiveZone = extractedZone ?? searchedZone;

    if (doctor.zona === effectiveZone && doctor.zona_raw === searchedZone && doctor.zona_normalizada === extractedZone) {
      summary.unchanged += 1;
      continue;
    }

    batch.update(doc.ref, {
      zona: effectiveZone,
      zona_raw: searchedZone,
      zona_normalizada: extractedZone,
    });
    summary.updated += 1;
    pending += 1;

    if (pending >= 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }

  if (pending > 0) {
    await batch.commit();
  }

  return summary;
}
