import type { Request, Response } from "express";
import { buildKeywordMatrix } from "./config/keywordStrategy";
import { collectAndSave } from "./services/collectionService";
import { claimNextBatch, resetProgress } from "./services/collectionProgress";

const DEFAULT_BATCH_SIZE = 2;
const MAX_BATCH_SIZE = 10;

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

  const matrix = buildKeywordMatrix();
  const claimed = await claimNextBatch(batchSize, matrix.length);

  if (!claimed) {
    res.status(200).json({ done: true, total_combinations: matrix.length, message: "Matrix fully collected" });
    return;
  }

  const batch = matrix.slice(claimed.startIndex, claimed.endIndex);
  const succeeded = [];
  const failed = [];

  // The cursor is already claimed at this point (avoids duplicate work under
  // concurrency), so failures are reported per-combo instead of aborting the
  // request — nothing here silently disappears.
  for (const combo of batch) {
    try {
      const outcome = await collectAndSave(combo.keyword, combo.zone, combo.specialty, apiKey);
      succeeded.push({ keyword: combo.keyword, zone: combo.zone, specialty: combo.specialty, ...outcome });
    } catch (error) {
      failed.push({ keyword: combo.keyword, zone: combo.zone, specialty: combo.specialty, error: (error as Error).message });
    }
  }

  res.status(200).json({
    done: false,
    processed: succeeded.length,
    failed: failed.length,
    next_index: claimed.endIndex,
    total_combinations: matrix.length,
    results: succeeded,
    errors: failed,
  });
}

// Only needed once, right after buildKeywordMatrix()'s order changes.
export async function resetCollectionProgressHandler(_req: Request, res: Response): Promise<void> {
  await resetProgress();
  res.status(200).json({ next_index: 0 });
}
