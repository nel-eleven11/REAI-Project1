const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({ projectId: "demo-test" });
}

const { saveDoctors } = require("../lib/services/doctorsRepo");

test("saveDoctors populates especialidad_normalizada/confidence from the business name", async () => {
  const placeId = `place-normalize-${Date.now()}`;
  const place = {
    place_id: placeId,
    nombre: "Dr. Ana Lopez - Dermatologia Clinica",
    direccion: "Zona 15, Guatemala",
    lat: 14.6,
    lng: -90.5,
    telefono: "22221234",
    sitio_web: null,
  };

  await saveDoctors([place], "dermatologo zona 15 Guatemala", "zona 15", "dermatología", "run-normalize-test");

  const snap = await admin.firestore().collection("medicos").doc(placeId).get();
  const data = snap.data();

  assert.equal(data.especialidad_normalizada, "dermatología");
  assert.ok(data.confidence > 0);
});

test("saveDoctors sets especialidad from the name when it disagrees with the searched specialty", async () => {
  const placeId = `place-effective-${Date.now()}`;
  const place = {
    place_id: placeId,
    nombre: "Clinica Pediatrica San Juan",
    direccion: "Zona 10, Guatemala",
    lat: 14.6,
    lng: -90.5,
    telefono: "22221234",
    sitio_web: null,
  };

  await saveDoctors([place], "clínica cardiología zona 10 Guatemala", "zona 10", "cardiología", "run-effective-test");

  const data = (await admin.firestore().collection("medicos").doc(placeId).get()).data();

  assert.equal(data.especialidad, "pediatría");
  assert.equal(data.especialidad_raw, "cardiología", "the searched specialty stays for traceability");
});

test("saveDoctors falls back to the searched specialty when the name reveals nothing", async () => {
  const placeId = `place-fallback-${Date.now()}`;
  const place = {
    place_id: placeId,
    nombre: "Centro Medico Los Proceres",
    direccion: "Zona 10, Guatemala",
    lat: 14.6,
    lng: -90.5,
    telefono: null,
    sitio_web: null,
  };

  await saveDoctors([place], "clínica cardiología zona 10 Guatemala", "zona 10", "cardiología", "run-fallback-test");

  const data = (await admin.firestore().collection("medicos").doc(placeId).get()).data();

  assert.equal(data.especialidad_normalizada, null);
  assert.equal(data.especialidad, "cardiología");
});
