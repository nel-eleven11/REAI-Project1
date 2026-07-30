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
  assert.equal(summary.missingApiKey, true, "summary must flag the missing-key config gap");

  const snap = await admin.firestore().collection("medicos").doc(placeId).get();
  const data = snap.data();

  assert.equal(data.place_id, placeId, "place_id must survive indefinitely (ToS)");
  assert.equal(data.nombre, undefined, "Places content must be purged after 30 days");
  assert.equal(data.telefono, undefined);
  assert.equal(data.direccion, undefined);
  assert.ok(data.purged_at, "there must be evidence of when it was purged");
  assert.equal(
    data.purge_reason,
    "no_api_key",
    "must distinguish 'no key configured' from 'Google confirmed it's gone'"
  );
});

test("purgeExpiredRecords purges suppressed doctors instead of refreshing them, even with a working API key", async () => {
  const placeId = `place-suppressed-purge-${Date.now()}`;
  await admin
    .firestore()
    .collection("medicos")
    .doc(placeId)
    .set({
      nombre: "Dr. Removed",
      especialidad_raw: "psiquiatría",
      direccion: "Zona 1, Guatemala",
      telefono: "22223333",
      sitio_web: "https://example.com",
      missing_fields: [],
      zona: "zona 1",
      lat: 14.6,
      lng: -90.5,
      fecha_recoleccion: pastIso(31),
      expires_at: pastIso(1),
      run_id: "test-run-suppressed-purge",
      place_id: placeId,
      keyword_usado: "psiquiatra zona 1 Guatemala",
      suppressed: true,
    });

  // Fake fetch that WOULD successfully "refresh" the place if called — this
  // proves the suppressed check skips the refresh attempt entirely, since
  // the doctor's content must still come out purged despite this.
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        status: "OK",
        result: { name: "Dr. Removed (refreshed)", formatted_address: "Zona 1", formatted_phone_number: "999" },
      })
    );

  try {
    await purgeExpiredRecords("fake-api-key-for-test");
  } finally {
    global.fetch = originalFetch;
  }

  const snap = await admin.firestore().collection("medicos").doc(placeId).get();
  const data = snap.data();

  assert.equal(data.place_id, placeId);
  assert.equal(data.nombre, undefined, "a suppressed doctor must be purged, not refreshed");
  assert.equal(data.suppressed, true, "suppressed must survive the purge");
  assert.ok(data.purged_at);
  assert.equal(data.purge_reason, "suppressed");
});

test("purgeExpiredRecords tags not_found_in_places when the API key works but Places has nothing for that place_id", async () => {
  const placeId = `place-notfound-${Date.now()}`;
  await admin
    .firestore()
    .collection("medicos")
    .doc(placeId)
    .set({
      nombre: "Dr. Gone",
      especialidad_raw: "oftalmología",
      direccion: "Zona 2, Guatemala",
      telefono: "22224444",
      sitio_web: null,
      missing_fields: ["sitio_web"],
      zona: "zona 2",
      lat: 14.6,
      lng: -90.5,
      fecha_recoleccion: pastIso(31),
      expires_at: pastIso(1),
      run_id: "test-run-notfound",
      place_id: placeId,
      keyword_usado: "oftalmologo zona 2 Guatemala",
      suppressed: false,
    });

  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ status: "NOT_FOUND" }));

  try {
    await purgeExpiredRecords("fake-api-key-for-test");
  } finally {
    global.fetch = originalFetch;
  }

  const snap = await admin.firestore().collection("medicos").doc(placeId).get();
  assert.equal(snap.data().purge_reason, "not_found_in_places");
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
