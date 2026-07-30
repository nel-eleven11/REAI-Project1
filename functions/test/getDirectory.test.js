const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({ projectId: "demo-test" });
}

const BASE_URL = "http://127.0.0.1:5001/demo-test/us-central1/getDirectory/directorio";
const WHITELISTED_HEADERS = { "X-Forwarded-For": "127.0.0.1" };

function futureIso(daysFromNow) {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();
}

async function seedDoctor(placeId, overrides = {}) {
  const base = {
    nombre: `Dr. Test ${placeId}`,
    especialidad_raw: "cardiología",
    direccion: "Zona 10, Guatemala",
    telefono: "22334455",
    sitio_web: "https://example.com",
    missing_fields: [],
    zona: "zona 10",
    lat: 14.6,
    lng: -90.5,
    fecha_recoleccion: new Date().toISOString(),
    expires_at: futureIso(30),
    run_id: "test-run",
    place_id: placeId,
    keyword_usado: "cardiólogo zona 10 Guatemala",
    suppressed: false,
  };
  await admin
    .firestore()
    .collection("medicos")
    .doc(placeId)
    .set({ ...base, ...overrides });
}

test("pagination respects max pageSize of 50 even if more is requested", async () => {
  const res = await fetch(`${BASE_URL}?pageSize=999`, { headers: WHITELISTED_HEADERS });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.pageSize, 50);
});

test("filters by especialidad and zona, excludes suppressed and expired", async () => {
  const idVisible = `place-visible-${Date.now()}`;
  const idSuppressed = `place-suppressed-${Date.now()}`;
  const idExpired = `place-expired-${Date.now()}`;
  const idOtherZone = `place-otherzone-${Date.now()}`;

  await Promise.all([
    seedDoctor(idVisible),
    seedDoctor(idSuppressed, { suppressed: true }),
    seedDoctor(idExpired, { expires_at: futureIso(-1) }),
    seedDoctor(idOtherZone, { zona: "zona 1" }),
  ]);

  const res = await fetch(`${BASE_URL}?especialidad=cardiología&zona=zona 10&pageSize=50`, {
    headers: WHITELISTED_HEADERS,
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  const ids = body.results.map((m) => m.place_id);
  assert.ok(ids.includes(idVisible), "the current record must appear");
  assert.ok(!ids.includes(idSuppressed), "a suppressed record must not appear");
  assert.ok(!ids.includes(idExpired), "a record with expired expires_at must not appear");
  assert.ok(!ids.includes(idOtherZone), "a record from another zone must not appear");
});
