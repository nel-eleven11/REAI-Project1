const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({ projectId: "demo-test" });
}

const { claimNextBatch } = require("../lib/services/collectionProgress");

test("claimNextBatch starts at 0 before any progress is recorded", async () => {
  await admin.firestore().collection("collection_progress").doc("state").delete();
  const claim = await claimNextBatch(2, 10);
  assert.deepEqual(claim, { startIndex: 0, endIndex: 2 });
});

test("claimNextBatch advances so the next call picks up where the previous one left off", async () => {
  await admin.firestore().collection("collection_progress").doc("state").delete();
  const first = await claimNextBatch(3, 10);
  const second = await claimNextBatch(3, 10);
  assert.deepEqual(first, { startIndex: 0, endIndex: 3 });
  assert.deepEqual(second, { startIndex: 3, endIndex: 6 });
});

test("claimNextBatch returns null once the matrix is fully claimed", async () => {
  await admin.firestore().collection("collection_progress").doc("state").delete();
  await claimNextBatch(5, 5);
  const claim = await claimNextBatch(5, 5);
  assert.equal(claim, null);
});

test("concurrent claims never overlap (the race the reviewer flagged)", async () => {
  await admin.firestore().collection("collection_progress").doc("state").delete();

  const [a, b, c] = await Promise.all([claimNextBatch(2, 100), claimNextBatch(2, 100), claimNextBatch(2, 100)]);
  const ranges = [a, b, c].sort((x, y) => x.startIndex - y.startIndex);

  assert.deepEqual(ranges[0], { startIndex: 0, endIndex: 2 });
  assert.deepEqual(ranges[1], { startIndex: 2, endIndex: 4 });
  assert.deepEqual(ranges[2], { startIndex: 4, endIndex: 6 });
});
