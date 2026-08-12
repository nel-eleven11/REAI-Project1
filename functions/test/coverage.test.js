const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({ projectId: "demo-test" });
}

const { computeCoverageStats } = require("../lib/services/coverageStatsService");

const COVERAGE_URL = "http://127.0.0.1:5001/demo-test/us-central1/getCoverage/coverage";
const WHITELISTED_HEADERS = { "X-Forwarded-For": "127.0.0.1, 66.102.8.200" };

function futureIso(daysFromNow) {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();
}

test("GET /coverage returns the precomputed zona x especialidad matrix", async () => {
  const placeId = `place-coverage-${Date.now()}`;
  await admin
    .firestore()
    .collection("medicos")
    .doc(placeId)
    .set({
      nombre: "Dr. Coverage Test",
      especialidad_raw: "psiquiatría",
      direccion: "Zona 16, Guatemala",
      telefono: "22221234",
      sitio_web: "https://example.com",
      missing_fields: [],
      zona: "zona 16",
      lat: 14.6,
      lng: -90.5,
      fecha_recoleccion: new Date().toISOString(),
      expires_at: futureIso(30),
      run_id: "test-run-coverage",
      place_id: placeId,
      keyword_usado: "psiquiatra zona 16 Guatemala",
      suppressed: false,
    });

  // computeCoverageStats is a scheduled function; call the underlying
  // service directly to populate coverage_stats before hitting the HTTP
  // endpoint, same pattern as purgeService.test.js.
  await computeCoverageStats();

  const res = await fetch(COVERAGE_URL, { headers: WHITELISTED_HEADERS });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(body.results));
  const cell = body.results.find((s) => s.zona === "zona 16" && s.especialidad === "psiquiatría");
  assert.ok(cell, "the zona 16 x psiquiatría cell must be present");
  assert.equal(cell.pct_con_telefono, 100);
});

test("GET /coverage is blocked for a non-whitelisted IP", async () => {
  const res = await fetch(COVERAGE_URL, { headers: { "X-Forwarded-For": "8.8.8.8, 66.102.8.200" } });
  assert.equal(res.status, 403);
});

test("searches_run counts zero-result collection_runs, distinguishing 'searched, found nothing' from 'never searched'", async () => {
  const zone = "zona 6";
  const specialty = "traumatología";

  await admin.firestore().collection("collection_runs").doc(`run-zero-${Date.now()}-a`).set({
    keyword: "traumatologo zona 6 Guatemala",
    zona: zone,
    especialidad: specialty,
    timestamp: new Date().toISOString(),
    api_calls: 1,
    results_new: 0,
    results_duplicated: 0,
    estimated_cost_usd: 0.032,
  });
  await admin.firestore().collection("collection_runs").doc(`run-zero-${Date.now()}-b`).set({
    keyword: "clinica traumatologia zona 6 Guatemala",
    zona: zone,
    especialidad: specialty,
    timestamp: new Date().toISOString(),
    api_calls: 1,
    results_new: 0,
    results_duplicated: 0,
    estimated_cost_usd: 0.032,
  });

  await computeCoverageStats();

  const res = await fetch(COVERAGE_URL, { headers: WHITELISTED_HEADERS });
  const body = await res.json();
  const cell = body.results.find((s) => s.zona === zone && s.especialidad === specialty);

  assert.ok(cell, "a cell with zero results but real searches must still appear");
  assert.equal(cell.searches_run, 2, "both zero-result runs must be counted");
  assert.equal(cell.unique_results, 0);
});
