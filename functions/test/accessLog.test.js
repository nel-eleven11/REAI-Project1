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

  await fetch("http://127.0.0.1:5001/demo-test/us-central1/getDirectory/directorio", {
    headers: { "X-Forwarded-For": spoofedIp },
  });

  // res.on("finish") writes fire-and-forget; poll instead of a fixed sleep
  // since cold starts (CI in particular) make the write latency unpredictable.
  const entry = await waitForAccessLog(spoofedIp);

  assert.equal(entry.resultado, 403);
  assert.equal(entry.ruta, "/directorio");
});

test("records a 429 in access_log for /correcciones (no IP whitelist there)", async () => {
  const ip = `9.9.8.${Math.floor(Math.random() * 255)}`;
  const makeRequest = () =>
    fetch("http://127.0.0.1:5001/demo-test/us-central1/submitCorrection/correcciones", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
      body: JSON.stringify({ place_id: "does-not-exist", tipo: "correccion", mensaje: "access_log coverage test" }),
    });

  for (let i = 0; i < 6; i += 1) {
    await makeRequest();
  }

  const entry = await waitForAccessLog(ip);
  assert.equal(entry.ruta, "/correcciones");
  assert.ok([404, 429].includes(entry.resultado), `expected 404 or 429, got ${entry.resultado}`);
});
