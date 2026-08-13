import type { Request, Response } from "express";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { runNextBatch } from "./services/collectionBatch";
import { resetProgress } from "./services/collectionProgress";

const DEFAULT_BATCH_SIZE = 2;
const MAX_BATCH_SIZE = 10;

// Unattended pace: 3 combos every 2h = 36/day = up to 756 Places calls/day,
// under the 1000/day quota cap. Stops on its own once the cursor reaches the
// end of the matrix, so it needs no manual disabling.
const SCHEDULED_BATCH_SIZE = 3;

// Place Details calls are sequential (up to 20 per combo), so the 60s default
// leaves no margin — and a timeout would skip already-claimed combos for good.
const SCHEDULED_TIMEOUT_SECONDS = 300;

// Walks the balanced keyword matrix unattended (plan.md sections 7-8). Shares
// the collection_progress cursor with the manual endpoint below, so the two
// can run without repeating searches.
export const runCollectionBatchScheduled = onSchedule(
  { schedule: "every 2 hours", timeoutSeconds: SCHEDULED_TIMEOUT_SECONDS },
  async () => {
    const apiKey = process.env.PLACES_API_KEY;
    if (!apiKey) {
      console.error("runCollectionBatchScheduled: PLACES_API_KEY not configured — skipping this run");
      return;
    }

    const outcome = await runNextBatch(SCHEDULED_BATCH_SIZE, apiKey);

    if (outcome.done) {
      console.log(
        `runCollectionBatchScheduled: matrix fully collected (${outcome.totalCombinations} combinations) — nothing to do`
      );
      return;
    }

    console.log(
      `runCollectionBatchScheduled: ${outcome.processed} processed, ${outcome.failed} failed, ` +
        `cursor at ${outcome.nextIndex}/${outcome.totalCombinations}`
    );

    // Loud on purpose: a claimed combo is never retried, so a quiet failure
    // leaves that zona x especialidad cell reading "never searched" forever
    // with nothing pointing at why.
    for (const failure of outcome.errors) {
      console.error(
        `runCollectionBatchScheduled: combo permanently skipped — keyword="${failure.keyword}" ` +
          `zona="${failure.zone}" especialidad="${failure.specialty}": ${failure.error}`
      );
    }
  }
);

// Resumable, shared cursor over the balanced keyword matrix (plan.md sections 7-8).
export async function runCollectionBatchHandler(req: Request, res: Response): Promise<void> {
  const apiKey = process.env.PLACES_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "PLACES_API_KEY not configured" });
    return;
  }

  const requestedBatchSize = Number(req.query.batchSize);
  const batchSize = Number.isInteger(requestedBatchSize) && requestedBatchSize > 0
    ? Math.min(requestedBatchSize, MAX_BATCH_SIZE)
    : DEFAULT_BATCH_SIZE;

  const outcome = await runNextBatch(batchSize, apiKey);

  if (outcome.done) {
    res.status(200).json({
      done: true,
      total_combinations: outcome.totalCombinations,
      message: "Matrix fully collected",
    });
    return;
  }

  res.status(200).json({
    done: false,
    processed: outcome.processed,
    failed: outcome.failed,
    next_index: outcome.nextIndex,
    total_combinations: outcome.totalCombinations,
    results: outcome.results,
    errors: outcome.errors,
  });
}

// Only needed once, right after buildKeywordMatrix()'s order changes.
export async function resetCollectionProgressHandler(_req: Request, res: Response): Promise<void> {
  await resetProgress();
  res.status(200).json({ next_index: 0 });
}
