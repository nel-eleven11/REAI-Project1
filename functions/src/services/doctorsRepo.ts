import * as admin from "firebase-admin";
import type { Doctor, CollectionRun } from "../types/doctor";
import type { PlaceWithDetails } from "./placesClient";
import { normalizeSpecialty } from "./specialtyNormalizer";

const RETENTION_DAYS = 30;
const TEXT_SEARCH_COST_USD = 0.032;
const DETAILS_COST_USD = 0.017;

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

  for (const place of places) {
    const docRef = db.collection("medicos").doc(place.place_id);
    const missingFields: string[] = [];
    if (!place.telefono) missingFields.push("telefono");
    if (!place.sitio_web) missingFields.push("sitio_web");

    const normalization = normalizeSpecialty(place.nombre);

    const isNew = await db.runTransaction(async (tx) => {
      const existing = await tx.get(docRef);

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

      tx.set(docRef, doctor, { merge: true });
      return !existing.exists;
    });

    if (isNew) {
      resultsNew += 1;
    } else {
      resultsDuplicated += 1;
    }
  }

  return { resultsNew, resultsDuplicated };
}

export async function saveCollectionRun(
  runId: string,
  keyword: string,
  zone: string,
  specialty: string,
  textSearchCalls: number,
  detailsCalls: number,
  saveResult: SaveResult
): Promise<void> {
  const db = admin.firestore();
  const estimatedCost = textSearchCalls * TEXT_SEARCH_COST_USD + detailsCalls * DETAILS_COST_USD;

  const run: CollectionRun = {
    keyword,
    zona: zone,
    especialidad: specialty,
    timestamp: new Date().toISOString(),
    api_calls: textSearchCalls + detailsCalls,
    results_new: saveResult.resultsNew,
    results_duplicated: saveResult.resultsDuplicated,
    estimated_cost_usd: Number(estimatedCost.toFixed(4)),
  };

  await db.collection("collection_runs").doc(runId).set(run);
}
