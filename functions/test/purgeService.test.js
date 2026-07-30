const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({ projectId: "demo-test" });
}

// purgeExpiredRecords is not mounted as HTTP in this project (it's a
// scheduled function), so we test the function directly against the
// Firestore emulator, same as the other unit/integration tests in this repo.
const { purgeExpiredRecords } = require("../lib/services/purgeService");

function pastIso(daysAgo) {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

function futureIso(daysFromNow) {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();
}

test("purgeExpiredRecords purges content and keeps place_id when there's no API key (can't refresh)", async () => {
  const placeId = `place-purge-${Date.now()}`;
  await admin
    .firestore()
    .collection("medicos")
    .doc(placeId)
    .set({
      nombre: "Dr. Expired",
      especialidad_raw: "dermatología",
      direccion: "Zona 9, Guatemala",
      telefono: "22221111",
      sitio_web: "https://example.com",
      missing_fields: [],
      zona: "zona 9",
      lat: 14.6,
      lng: -90.5,
      fecha_recoleccion: pastIso(31),
      expires_at: pastIso(1),
      run_id: "test-run-purge",
      place_id: placeId,
      keyword_usado: "dermatólogo zona 9 Guatemala",
      suppressed: false,
    });

  // No apiKey (undefined) => can't refresh => must purge.
  const summary = await purgeExpiredRecords(undefined);
  assert.ok(summary.scanned >= 1);

  const snap = await admin.firestore().collection("medicos").doc(placeId).get();
  const data = snap.data();

  assert.equal(data.place_id, placeId, "place_id must survive indefinitely (ToS)");
  assert.equal(data.nombre, undefined, "Places content must be purged after 30 days");
  assert.equal(data.telefono, undefined);
  assert.equal(data.direccion, undefined);
  assert.ok(data.purged_at, "there must be evidence of when it was purged");
});

test("purgeExpiredRecords does not touch current documents (future expires_at)", async () => {
  const placeId = `place-current-${Date.now()}`;
  await admin
    .firestore()
    .collection("medicos")
    .doc(placeId)
    .set({
      nombre: "Dr. Current",
      especialidad_raw: "ginecología",
      direccion: "Zona 14, Guatemala",
      telefono: "22225555",
      sitio_web: null,
      missing_fields: ["sitio_web"],
      zona: "zona 14",
      lat: 14.6,
      lng: -90.5,
      fecha_recoleccion: new Date().toISOString(),
      expires_at: futureIso(30),
      run_id: "test-run-current",
      place_id: placeId,
      keyword_usado: "ginecólogo zona 14 Guatemala",
      suppressed: false,
    });

  await purgeExpiredRecords(undefined);

  const snap = await admin.firestore().collection("medicos").doc(placeId).get();
  const data = snap.data();
  assert.equal(data.nombre, "Dr. Current", "a current document must not be purged");
});
