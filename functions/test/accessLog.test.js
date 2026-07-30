const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({ projectId: "demo-test" });
}

test("records a 403 in access_log when the whitelist blocks a request", async () => {
  const spoofedIp = `9.9.9.${Math.floor(Math.random() * 255)}`;

  await fetch("http://127.0.0.1:5001/demo-test/us-central1/obtenerDirectorio/directorio", {
    headers: { "X-Forwarded-For": spoofedIp },
  });

  // res.on("finish") writes fire-and-forget; give it a moment to land.
  await new Promise((resolve) => setTimeout(resolve, 500));

  const snap = await admin
    .firestore()
    .collection("access_log")
    .where("ip", "==", spoofedIp)
    .limit(1)
    .get();

  assert.equal(snap.empty, false);
  assert.equal(snap.docs[0].data().resultado, 403);
  assert.equal(snap.docs[0].data().ruta, "/directorio");
});
