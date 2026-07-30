import * as admin from "firebase-admin";
import type { Doctor, CollectionRun } from "../types/doctor";
import type { PlaceWithDetails } from "./placesClient";
import { normalizeSpecialty } from "./specialtyNormalizer";

const RETENTION_DAYS = 30;
const COST_PER_CALL_USD = 0.017;

export interface SaveResult {
  resultsNew: number;
  resultsDuplicated: number;
}

export async function saveDoctors(
  places: PlaceWithDetails[],
  keyword: string,
  zone: string,
  specialty: string,
  runId: string
): Promise<SaveResult> {
  const db = admin.firestore();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);

  let resultsNew = 0;
  let resultsDuplicated = 0;

  const batch = db.batch();
  for (const place of places) {
    const docRef = db.collection("medicos").doc(place.place_id);
    const existing = await docRef.get();
    if (existing.exists) {
      resultsDuplicated += 1;
    } else {
      resultsNew += 1;
    }

    const missingFields: string[] = [];
    if (!place.telefono) missingFields.push("telefono");
    if (!place.sitio_web) missingFields.push("sitio_web");

    const normalization = normalizeSpecialty(place.nombre);

    // suppressed survives re-collection: only set on first insert, never reset.
    const doctor: Omit<Doctor, "suppressed"> & { suppressed?: boolean } = {
      nombre: place.nombre,
      especialidad_raw: specialty,
      especialidad_normalizada: normalization.especialidad_normalizada,
      confidence: normalization.confidence,
      direccion: place.direccion,
      telefono: place.telefono,
      sitio_web: place.sitio_web,
      missing_fields: missingFields,
      zona: zone,
      lat: place.lat,
      lng: place.lng,
      fecha_recoleccion: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      run_id: runId,
      place_id: place.place_id,
      keyword_usado: keyword,
    };
    if (!existing.exists) {
      doctor.suppressed = false;
    }

    batch.set(docRef, doctor, { merge: true });
  }
  await batch.commit();

  return { resultsNew, resultsDuplicated };
}

export async function saveCollectionRun(
  runId: string,
  keyword: string,
  zone: string,
  apiCalls: number,
  saveResult: SaveResult
): Promise<void> {
  const db = admin.firestore();
  const run: CollectionRun = {
    keyword,
    zona: zone,
    timestamp: new Date().toISOString(),
    api_calls: apiCalls,
    results_new: saveResult.resultsNew,
    results_duplicated: saveResult.resultsDuplicated,
    estimated_cost_usd: Number((apiCalls * COST_PER_CALL_USD).toFixed(4)),
  };

  await db.collection("collection_runs").doc(runId).set(run);
}
