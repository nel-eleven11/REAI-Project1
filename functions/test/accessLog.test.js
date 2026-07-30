const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({ projectId: "demo-test" });
}

async function waitForAccessLog(ip, { timeoutMs = 5000, intervalMs = 200 } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const snap = await admin.firestore().collection("access_log").where("ip", "==", ip).limit(1).get();
    if (!snap.empty) {
      return snap.docs[0].data();
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`access_log entry for ip=${ip} did not appear within ${timeoutMs}ms`);
}

test("records a 403 in access_log when the whitelist blocks a request", async () => {
  const spoofedIp = `9.9.9.${Math.floor(Math.random() * 255)}`;

  await fetch("http://127.0.0.1:5001/demo-test/us-central1/obtenerDirectorio/directorio", {
    headers: { "X-Forwarded-For": spoofedIp },
  });

  // res.on("finish") writes fire-and-forget; poll instead of a fixed sleep
  // since cold starts (CI in particular) make the write latency unpredictable.
  const entry = await waitForAccessLog(spoofedIp);

  assert.equal(entry.resultado, 403);
  assert.equal(entry.ruta, "/directorio");
});
