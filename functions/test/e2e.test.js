const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({ projectId: "demo-test" });
}

// End-to-end walk against the Firebase emulator (plan.md Semana 3, last
// checkbox): exercises the full lifecycle a real record goes through —
// collected -> visible in /directorio -> removed via /correcciones ->
// no longer visible -> coverage endpoint still responds. Unlike the
// per-feature tests, this one asserts the handoffs BETWEEN endpoints.

const DIRECTORY_URL = "http://127.0.0.1:5001/demo-test/us-central1/getDirectory/directorio";
const CORRECTIONS_URL = "http://127.0.0.1:5001/demo-test/us-central1/submitCorrection/correcciones";
const COVERAGE_URL = "http://127.0.0.1:5001/demo-test/us-central1/getCoverage/coverage";
const WHITELISTED_HEADERS = { "X-Forwarded-For": "127.0.0.1, 66.102.8.200" };

function futureIso(daysFromNow) {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();
}

test("e2e: a record is visible, then a removal request makes it disappear from /directorio", async () => {
  const placeId = `place-e2e-${Date.now()}`;
  const especialidad = "oftalmología";
  const zona = "zona 11";

  // 1. Simulates what collectDoctors would have written.
  await admin
    .firestore()
    .collection("medicos")
    .doc(placeId)
    .set({
      nombre: "Dr. E2E Test",
      especialidad,
      especialidad_raw: especialidad,
      especialidad_normalizada: especialidad,
      direccion: "Zona 11, Guatemala",
      telefono: "22225678",
      sitio_web: null,
      missing_fields: ["sitio_web"],
      zona,
      lat: 14.6,
      lng: -90.55,
      fecha_recoleccion: new Date().toISOString(),
      expires_at: futureIso(30),
      run_id: "test-run-e2e",
      place_id: placeId,
      keyword_usado: "oftalmólogo zona 11 Guatemala",
      suppressed: false,
    });

  // 2. It must appear through the public API.
  const firstSearch = await fetch(
    `${DIRECTORY_URL}?especialidad=${encodeURIComponent(especialidad)}&zona=${encodeURIComponent(zona)}&pageSize=50`,
    { headers: WHITELISTED_HEADERS }
  );
  const firstBody = await firstSearch.json();
  assert.equal(firstSearch.status, 200);
  assert.ok(
    firstBody.results.some((m) => m.place_id === placeId),
    "the record must be visible before any removal request"
  );

  // 3. A removal request is submitted (as the UI's corrections form would do).
  const removalRes = await fetch(CORRECTIONS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "192.0.2.50, 66.102.8.200" },
    body: JSON.stringify({
      place_id: placeId,
      tipo: "remocion",
      mensaje: "e2e test: I do not authorize appearing here",
    }),
  });
  const removalBody = await removalRes.json();
  assert.equal(removalRes.status, 201);
  assert.equal(removalBody.estado, "aplicada");

  // 4. It must no longer appear through the public API.
  const secondSearch = await fetch(
    `${DIRECTORY_URL}?especialidad=${encodeURIComponent(especialidad)}&zona=${encodeURIComponent(zona)}&pageSize=50`,
    { headers: WHITELISTED_HEADERS }
  );
  const secondBody = await secondSearch.json();
  assert.equal(secondSearch.status, 200);
  assert.ok(
    !secondBody.results.some((m) => m.place_id === placeId),
    "the record must disappear immediately after a removal request"
  );
});

test("e2e: pagination cap and the coverage endpoint both respond correctly end-to-end", async () => {
  const overRequested = await fetch(`${DIRECTORY_URL}?pageSize=500`, { headers: WHITELISTED_HEADERS });
  const overRequestedBody = await overRequested.json();
  assert.equal(overRequested.status, 200);
  assert.equal(overRequestedBody.pageSize, 50, "pageSize must be capped at 50 regardless of what's requested");

  const coverageRes = await fetch(COVERAGE_URL, { headers: WHITELISTED_HEADERS });
  assert.equal(coverageRes.status, 200);
  const coverageBody = await coverageRes.json();
  assert.ok(Array.isArray(coverageBody.results));
});
