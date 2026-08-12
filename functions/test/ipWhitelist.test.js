const test = require("node:test");
const assert = require("node:assert/strict");

const BASE_URL = "http://127.0.0.1:5001/demo-test/us-central1/getDirectory/directorio";

// getDirectory is mounted with trustedHops=2 (Hosting + GFE, see index.ts) —
// the real client IP is the SECOND-TO-LAST entry, not the last one.

test("blocks when the real client (second-to-last entry) isn't whitelisted", async () => {
  const res = await fetch(BASE_URL, { headers: { "X-Forwarded-For": "8.8.8.8, 66.102.8.200" } });
  assert.equal(res.status, 403);
});

test("blocks an attacker spoofing the whitelisted IP earlier in the header", async () => {
  const res = await fetch(BASE_URL, {
    headers: { "X-Forwarded-For": "127.0.0.1, 8.8.8.8, 66.102.8.200" },
  });
  assert.equal(res.status, 403);
});

test("allows the whitelisted IP when it's the real second-to-last entry", async () => {
  const res = await fetch(BASE_URL, { headers: { "X-Forwarded-For": "203.0.113.5, 127.0.0.1, 66.102.8.200" } });
  assert.equal(res.status, 200);
});

test("fails closed when fewer than 2 hops are present (defensive, shouldn't happen via Hosting)", async () => {
  const res = await fetch(BASE_URL, { headers: { "X-Forwarded-For": "127.0.0.1" } });
  assert.equal(res.status, 403);
});
