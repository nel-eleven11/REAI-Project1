const test = require("node:test");
const assert = require("node:assert/strict");

const BASE_URL = "http://127.0.0.1:5001/demo-test/us-central1/getDirectory/directorio";

test("blocks a client IP that isn't on the whitelist", async () => {
  const res = await fetch(BASE_URL, { headers: { "X-Forwarded-For": "8.8.8.8" } });
  assert.equal(res.status, 403);
});

test("blocks a spoofed prefix when the load balancer's client IP isn't whitelisted", async () => {
  const res = await fetch(BASE_URL, {
    headers: { "X-Forwarded-For": "127.0.0.1, 8.8.8.8, 192.178.11.69" },
  });
  assert.equal(res.status, 403);
});

test("allows the verified client IP immediately before the load balancer IP", async () => {
  const res = await fetch(BASE_URL, {
    headers: { "X-Forwarded-For": "203.0.113.5, 127.0.0.1, 192.178.11.69" },
  });
  assert.equal(res.status, 200);
});

test("allows a direct request from the whitelisted IP", async () => {
  const res = await fetch(BASE_URL, { headers: { "X-Forwarded-For": "127.0.0.1" } });
  assert.equal(res.status, 200);
});
