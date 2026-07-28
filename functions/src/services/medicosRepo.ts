import * as admin from "firebase-admin";
import type { Medico, CollectionRun } from "../types/medico";
import type { PlaceWithDetails } from "./placesClient";

const RETENTION_DAYS = 30;
const COST_PER_CALL_USD = 0.017;

export interface SaveResult {
  resultsNew: number;
  resultsDuplicated: number;
}

export async function saveMedicos(
  places: PlaceWithDetails[],
  keyword: string,
  zona: string,
  especialidadRaw: string,
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

    // suppressed must survive re-collection (plan.md sección 12): never reset
    // it here, only initialize it to false the first time the doc is created.
    const medico: Omit<Medico, "suppressed"> & { suppressed?: boolean } = {
      nombre: place.nombre,
      especialidad_raw: especialidadRaw,
      direccion: place.direccion,
      telefono: place.telefono,
      sitio_web: place.sitio_web,
      missing_fields: missingFields,
      zona,
      lat: place.lat,
      lng: place.lng,
      fecha_recoleccion: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      run_id: runId,
      place_id: place.place_id,
      keyword_usado: keyword,
    };
    if (!existing.exists) {
      medico.suppressed = false;
    }

    batch.set(docRef, medico, { merge: true });
  }
  await batch.commit();

  return { resultsNew, resultsDuplicated };
}

export async function saveCollectionRun(
  runId: string,
  keyword: string,
  zona: string,
  apiCalls: number,
  saveResult: SaveResult
): Promise<void> {
  const db = admin.firestore();
  const run: CollectionRun = {
    keyword,
    zona,
    timestamp: new Date().toISOString(),
    api_calls: apiCalls,
    results_new: saveResult.resultsNew,
    results_duplicated: saveResult.resultsDuplicated,
    estimated_cost_usd: Number((apiCalls * COST_PER_CALL_USD).toFixed(4)),
  };

  await db.collection("collection_runs").doc(runId).set(run);
}
