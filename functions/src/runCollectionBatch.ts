import type { Request, Response } from "express";
import { buildKeywordMatrix } from "./config/keywordStrategy";
import { collectAndSave } from "./services/collectionService";
import { getNextIndex, advanceNextIndex } from "./services/collectionProgress";

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
  const startIndex = await getNextIndex();

  if (startIndex >= matrix.length) {
    res.status(200).json({ done: true, total_combinations: matrix.length, message: "Matrix fully collected" });
    return;
  }

  const batch = matrix.slice(startIndex, startIndex + batchSize);
  const outcomes = [];

  try {
    for (const combo of batch) {
      const outcome = await collectAndSave(combo.keyword, combo.zone, combo.specialty, apiKey);
      outcomes.push({ keyword: combo.keyword, zone: combo.zone, specialty: combo.specialty, ...outcome });
    }
    await advanceNextIndex(startIndex + batch.length);

    res.status(200).json({
      done: false,
      processed: outcomes.length,
      next_index: startIndex + batch.length,
      total_combinations: matrix.length,
      results: outcomes,
    });
  } catch (error) {
    res.status(502).json({ error: "Failed to query Places API", detail: (error as Error).message });
  }
}
