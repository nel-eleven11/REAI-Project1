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
