const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({ projectId: "demo-test" });
}

const { getNextIndex, advanceNextIndex } = require("../lib/services/collectionProgress");

test("getNextIndex defaults to 0 before any progress is recorded", async () => {
  await admin.firestore().collection("collection_progress").doc("state").delete();
  assert.equal(await getNextIndex(), 0);
});

test("advanceNextIndex persists the cursor for the next call to read", async () => {
  await advanceNextIndex(42);
  assert.equal(await getNextIndex(), 42);
});
