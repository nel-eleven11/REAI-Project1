const test = require("node:test");
const assert = require("node:assert/strict");

const BASE_URL = "http://127.0.0.1:5001/demo-test/us-central1/getDirectory/directorio";

test("blocks a client IP that isn't on the whitelist", async () => {
  const res = await fetch(BASE_URL, { headers: { "X-Forwarded-For": "8.8.8.8" } });
  assert.equal(res.status, 403);
});

test("blocks an attacker who spoofs the whitelisted IP as the first entry (GFE appends their real IP last)", async () => {
  // This models the actual deployed topology (direct Cloud Functions URL,
  // no External HTTPS Load Balancer): the attacker sends one fake value,
  // GFE appends their real IP as the second, LAST entry.
  const res = await fetch(BASE_URL, { headers: { "X-Forwarded-For": "127.0.0.1, 8.8.8.8" } });
  assert.equal(res.status, 403);
});

test("allows the whitelisted IP when it's the real last entry (as GFE appends it, no external LB)", async () => {
  const res = await fetch(BASE_URL, { headers: { "X-Forwarded-For": "203.0.113.5, 127.0.0.1" } });
  assert.equal(res.status, 200);
});

test("allows a direct request from the whitelisted IP", async () => {
  const res = await fetch(BASE_URL, { headers: { "X-Forwarded-For": "127.0.0.1" } });
  assert.equal(res.status, 200);
});
