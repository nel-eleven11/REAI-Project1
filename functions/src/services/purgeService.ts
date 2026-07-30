import * as admin from "firebase-admin";
import type { Doctor } from "../types/doctor";
import { searchPlaceById } from "./placesClient";

const RETENTION_DAYS = 30;

export type PurgeReason = "suppressed" | "no_api_key" | "not_found_in_places" | "refresh_error";

export interface PurgeSummary {
  scanned: number;
  refreshed: number;
  purged: number;
  errors: number;
  missingApiKey: boolean;
}

// Places content max 30 days (plan.md section 6). Suppressed doctors are
// purged directly, never refreshed, or removal would be undone.
export async function purgeExpiredRecords(apiKey: string | undefined): Promise<PurgeSummary> {
  const db = admin.firestore();
  const nowIso = new Date().toISOString();

  if (!apiKey) {
    console.warn(
      "purgeExpiredRecords: PLACES_API_KEY not configured — every expired record will be purged " +
        "without attempting a refresh. This is a configuration gap, not confirmation the places are gone."
    );
  }

  const expiredSnap = await db.collection("medicos").where("expires_at", "<=", nowIso).get();

  const summary: PurgeSummary = {
    scanned: expiredSnap.size,
    refreshed: 0,
    purged: 0,
    errors: 0,
    missingApiKey: !apiKey,
  };

  for (const doc of expiredSnap.docs) {
    const doctor = doc.data() as Doctor;

    if (doctor.suppressed) {
      await tryPurge(doc.ref, doctor.place_id, "suppressed", summary);
      continue;
    }

    if (!apiKey) {
      await tryPurge(doc.ref, doctor.place_id, "no_api_key", summary);
      continue;
    }

    try {
      const refreshed = await searchPlaceById(doctor.place_id, apiKey);

      if (refreshed) {
        const expiresAt = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
        const missingFields: string[] = [];
        if (!refreshed.telefono) missingFields.push("telefono");
        if (!refreshed.sitio_web) missingFields.push("sitio_web");

        await doc.ref.update({
          nombre: refreshed.nombre,
          direccion: refreshed.direccion,
          telefono: refreshed.telefono,
          sitio_web: refreshed.sitio_web,
          missing_fields: missingFields,
          lat: refreshed.lat,
          lng: refreshed.lng,
          fecha_recoleccion: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        });
        summary.refreshed += 1;
      } else {
        await tryPurge(doc.ref, doctor.place_id, "not_found_in_places", summary);
      }
    } catch (error) {
      console.error(`purgeExpiredRecords: failed processing place_id=${doctor.place_id}`, error);
      await tryPurge(doc.ref, doctor.place_id, "refresh_error", summary);
    }
  }

  return summary;
}

async function tryPurge(
  ref: FirebaseFirestore.DocumentReference,
  placeId: string,
  reason: PurgeReason,
  summary: PurgeSummary
): Promise<boolean> {
  try {
    await purgeDocContent(ref, placeId, reason);
    summary.purged += 1;
    return true;
  } catch (error) {
    console.error(`purgeExpiredRecords: failed purging place_id=${placeId} (reason=${reason})`, error);
    summary.errors += 1;
    return false;
  }
}

async function purgeDocContent(
  ref: FirebaseFirestore.DocumentReference,
  placeId: string,
  reason: PurgeReason
): Promise<void> {
  await ref.set(
    {
      place_id: placeId,
      nombre: admin.firestore.FieldValue.delete(),
      especialidad_raw: admin.firestore.FieldValue.delete(),
      direccion: admin.firestore.FieldValue.delete(),
      telefono: admin.firestore.FieldValue.delete(),
      sitio_web: admin.firestore.FieldValue.delete(),
      lat: admin.firestore.FieldValue.delete(),
      lng: admin.firestore.FieldValue.delete(),
      zona: admin.firestore.FieldValue.delete(),
      keyword_usado: admin.firestore.FieldValue.delete(),
      missing_fields: admin.firestore.FieldValue.delete(),
      run_id: admin.firestore.FieldValue.delete(),
      fecha_recoleccion: admin.firestore.FieldValue.delete(),
      expires_at: admin.firestore.FieldValue.delete(),
      purged_at: new Date().toISOString(),
      purge_reason: reason,
    },
    { merge: true }
  );
}
