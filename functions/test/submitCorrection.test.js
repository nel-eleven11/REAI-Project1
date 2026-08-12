const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({ projectId: "demo-test" });
}

const CORRECTIONS_URL = "http://127.0.0.1:5001/demo-test/us-central1/submitCorrection/correcciones";

function futureIso(daysFromNow) {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();
}

async function seedDoctor(placeId) {
  await admin
    .firestore()
    .collection("medicos")
    .doc(placeId)
    .set({
      nombre: `Dr. Correction Test ${placeId}`,
      especialidad_raw: "pediatría",
      direccion: "Zona 1, Guatemala",
      telefono: "22334455",
      sitio_web: null,
      missing_fields: ["sitio_web"],
      zona: "zona 1",
      lat: 14.6,
      lng: -90.5,
      fecha_recoleccion: new Date().toISOString(),
      expires_at: futureIso(30),
      run_id: "test-run-correction",
      place_id: placeId,
      keyword_usado: "pediatra zona 1 Guatemala",
      suppressed: false,
    });
}

test("removal: applied automatically, marks suppressed=true and estado=aplicada", async () => {
  const placeId = `place-removal-${Date.now()}`;
  await seedDoctor(placeId);

  const res = await fetch(CORRECTIONS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "192.0.2.10, 66.102.8.200" },
    body: JSON.stringify({ place_id: placeId, tipo: "remocion", mensaje: "I do not authorize appearing here" }),
  });

  const body = await res.json();

  assert.equal(res.status, 201);
  assert.equal(body.estado, "aplicada");

  const doctorSnap = await admin.firestore().collection("medicos").doc(placeId).get();
  assert.equal(doctorSnap.data().suppressed, true);

  const correctionSnap = await admin.firestore().collection("correcciones").doc(body.id).get();
  assert.equal(correctionSnap.data().tipo, "remocion");
  assert.equal(correctionSnap.data().estado, "aplicada");
});

test("correction: stays pending, does not modify suppressed", async () => {
  const placeId = `place-correction-${Date.now()}`;
  await seedDoctor(placeId);

  const res = await fetch(CORRECTIONS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "192.0.2.11, 66.102.8.200" },
    body: JSON.stringify({ place_id: placeId, tipo: "correccion", mensaje: "The phone number is wrong" }),
  });

  const body = await res.json();

  assert.equal(res.status, 201);
  assert.equal(body.estado, "pendiente");

  const doctorSnap = await admin.firestore().collection("medicos").doc(placeId).get();
  assert.equal(doctorSnap.data().suppressed, false);
});

test("rate limit: blocks after exceeding the max requests in the window", async () => {
  const ip = `10.10.10.${Math.floor(Math.random() * 250)}`;
  const placeId = `place-ratelimit-${Date.now()}`;
  await seedDoctor(placeId);

  const makeRequest = () =>
    fetch(CORRECTIONS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": `${ip}, 66.102.8.200` },
      body: JSON.stringify({ place_id: placeId, tipo: "correccion", mensaje: "test rate limit" }),
    });

  const results = [];
  for (let i = 0; i < 7; i += 1) {
    const res = await makeRequest();
    results.push(res.status);
  }

  assert.ok(results.includes(429), `expected at least one 429 in: ${results.join(",")}`);
});

test("correction on a non-existent place_id returns 404", async () => {
  const res = await fetch(CORRECTIONS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "192.0.2.12, 66.102.8.200" },
    body: JSON.stringify({ place_id: "does-not-exist-ever", tipo: "correccion", mensaje: "x" }),
  });
  assert.equal(res.status, 404);
});
