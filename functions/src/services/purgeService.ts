import * as admin from "firebase-admin";
import type { Doctor } from "../types/doctor";
import { searchPlaceById } from "./placesClient";

const RETENTION_DAYS = 30;

export interface PurgeSummary {
  scanned: number;
  refreshed: number;
  purged: number;
  errors: number;
}

/**
 * Google Maps Platform ToS compliance (plan.md section 6): Places content
 * (name, phone, address, etc.) can only be cached for up to 30 days.
 * `place_id` may be retained indefinitely.
 *
 * For each expired document:
 *  - try to refresh by re-querying by place_id and renewing expires_at
 *  - if the refresh fails (no API key, the Places API fails, or the place
 *    no longer exists) purge the content and keep only the place_id.
 */
export async function purgeExpiredRecords(apiKey: string | undefined): Promise<PurgeSummary> {
  const db = admin.firestore();
  const nowIso = new Date().toISOString();

  const expiredSnap = await db.collection("medicos").where("expires_at", "<=", nowIso).get();

  const summary: PurgeSummary = { scanned: expiredSnap.size, refreshed: 0, purged: 0, errors: 0 };

  for (const doc of expiredSnap.docs) {
    const doctor = doc.data() as Doctor;

    try {
      const refreshed = apiKey ? await searchPlaceById(doctor.place_id, apiKey) : null;


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
        await purgeDocContent(doc.ref, doctor.place_id);
        summary.purged += 1;
      }
    } catch (error) {
      console.error(`purgeExpiredRecords: failed processing place_id=${doctor.place_id}`, error);
      // On any failure (network, quota, etc.) purge conservatively rather
      // than leaving expired-but-full-content data past the ToS window.
      try {
        await purgeDocContent(doc.ref, doctor.place_id);
        summary.purged += 1;
      } catch (innerError) {
        console.error(`purgeExpiredRecords: failed purging place_id=${doctor.place_id}`, innerError);
        summary.errors += 1;
      }
    }
  }

  return summary;
}

async function purgeDocContent(ref: FirebaseFirestore.DocumentReference, placeId: string): Promise<void> {
  // Only place_id survives indefinitely (ToS). Everything else is cleared.

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
    },
    { merge: true }
  );
}
