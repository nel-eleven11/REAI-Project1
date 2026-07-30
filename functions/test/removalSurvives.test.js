const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({ projectId: "demo-test" });
}

const { saveDoctors } = require("../lib/services/doctorsRepo");

test("a suppressed=true record does not reappear after re-collecting the same place_id", async () => {
  const placeId = `place-suppressed-survives-${Date.now()}`;
  const especialidad = "ortopedia";
  const zona = "zona 4";
  const keyword = "ortopedista zona 4 Guatemala";

  const place = {
    place_id: placeId,
    nombre: "Dr. Original",
    direccion: "Zona 4, Guatemala",
    lat: 14.6,
    lng: -90.5,
    telefono: "22229999",
    sitio_web: null,
  };

  // First collection: creates the document with suppressed=false.
  await saveDoctors([place], keyword, zona, especialidad, "run-1");

  // Simulates a removal request marking suppressed=true directly
  // (equivalent to what submitCorrectionHandler does).
  await admin.firestore().collection("medicos").doc(placeId).update({ suppressed: true });

  // Re-collection: collectDoctors finds the same place_id again in a future
  // run and upserts via saveDoctors again.
  await saveDoctors([place], keyword, zona, especialidad, "run-2");

  const snap = await admin.firestore().collection("medicos").doc(placeId).get();
  const data = snap.data();

  assert.equal(
    data.suppressed,
    true,
    "suppressed must survive a re-collection; the upsert must not reset it to false"
  );
});
