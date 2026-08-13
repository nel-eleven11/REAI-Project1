const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({ projectId: "demo-test" });
}

const { claimNextBatch, resetProgress } = require("../lib/services/collectionProgress");
const { runNextBatch } = require("../lib/services/collectionBatch");
const { buildKeywordMatrix } = require("../lib/config/keywordStrategy");

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

test("resetProgress moves the cursor back to 0", async () => {
  await claimNextBatch(5, 100);
  await resetProgress();
  const claim = await claimNextBatch(2, 100);
  assert.deepEqual(claim, { startIndex: 0, endIndex: 2 });
});

// runNextBatch drives the same collection_progress/state document as the tests
// above. node --test runs test FILES in parallel processes, so these live here
// rather than in their own file — otherwise the two files would race over that
// single shared cursor and fail intermittently.

const MATRIX_LENGTH = buildKeywordMatrix().length;

async function setCursor(nextIndex) {
  await admin.firestore().collection("collection_progress").doc("state").set({ next_index: nextIndex });
}

// placesClient talks to Google through global fetch, so stubbing it here keeps
// the batch tests free of real (paid) Places traffic.
function stubFetch(respond) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    return { json: async () => respond(href, calls.length) };
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function textSearchBody(placeId) {
  return {
    status: "OK",
    results: [
      {
        place_id: placeId,
        name: `Clínica ${placeId}`,
        formatted_address: "Zona 5, Guatemala",
        geometry: { location: { lat: 14.6, lng: -90.5 } },
      },
    ],
  };
}

const DETAILS_BODY = { status: "OK", result: { formatted_phone_number: "22221111", website: null } };

test("runNextBatch advances the shared cursor by the batch size", async () => {
  await setCursor(0);
  let seq = 0;
  const stub = stubFetch((url) =>
    url.includes("/textsearch/") ? textSearchBody(`batch-adv-${Date.now()}-${(seq += 1)}`) : DETAILS_BODY
  );

  try {
    const outcome = await runNextBatch(2, "fake-key");

    assert.equal(outcome.done, false);
    assert.equal(outcome.processed, 2);
    assert.equal(outcome.failed, 0);
    assert.equal(outcome.nextIndex, 2);
    assert.equal(outcome.totalCombinations, MATRIX_LENGTH);
  } finally {
    stub.restore();
  }
});

test("runNextBatch reports a failed combo without aborting the rest of the batch", async () => {
  await setCursor(0);
  let textSearches = 0;
  const stub = stubFetch((url) => {
    if (!url.includes("/textsearch/")) return DETAILS_BODY;
    textSearches += 1;
    if (textSearches === 1) {
      return { status: "REQUEST_DENIED", error_message: "stubbed rejection", results: [] };
    }
    return textSearchBody(`batch-fail-${Date.now()}-${textSearches}`);
  });

  try {
    const outcome = await runNextBatch(2, "fake-key");

    assert.equal(outcome.processed, 1);
    assert.equal(outcome.failed, 1);
    assert.equal(outcome.errors.length, 1);
    assert.match(outcome.errors[0].error, /REQUEST_DENIED/);
    // The cursor still advanced past the failed combo: it is skipped for good,
    // which is why the scheduled function logs each failure loudly.
    assert.equal(outcome.nextIndex, 2);
  } finally {
    stub.restore();
  }
});

test("runNextBatch reports done without calling Places once the matrix is exhausted", async () => {
  await setCursor(MATRIX_LENGTH);
  const stub = stubFetch(() => {
    throw new Error("Places must not be called once the matrix is exhausted");
  });

  try {
    const outcome = await runNextBatch(3, "fake-key");

    assert.equal(outcome.done, true);
    assert.equal(outcome.processed, 0);
    assert.equal(outcome.failed, 0);
    assert.equal(outcome.totalCombinations, MATRIX_LENGTH);
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});
