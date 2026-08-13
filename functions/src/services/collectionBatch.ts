import { buildKeywordMatrix } from "../config/keywordStrategy";
import { collectAndSave, type CollectionOutcome } from "./collectionService";
import { claimNextBatch } from "./collectionProgress";

export interface BatchComboResult extends CollectionOutcome {
  keyword: string;
  zone: string;
  specialty: string;
}

export interface BatchComboError {
  keyword: string;
  zone: string;
  specialty: string;
  error: string;
}

export interface BatchOutcome {
  done: boolean;
  processed: number;
  failed: number;
  nextIndex: number;
  totalCombinations: number;
  results: BatchComboResult[];
  errors: BatchComboError[];
}

// Shared by the HTTP handler and the scheduled function — same split as
// coverageStatsService/purgeService: the service owns the logic, the handler
// and the scheduler are thin shells over it.
export async function runNextBatch(batchSize: number, apiKey: string): Promise<BatchOutcome> {
  const matrix = buildKeywordMatrix();
  const claimed = await claimNextBatch(batchSize, matrix.length);

  if (!claimed) {
    return {
      done: true,
      processed: 0,
      failed: 0,
      nextIndex: matrix.length,
      totalCombinations: matrix.length,
      results: [],
      errors: [],
    };
  }

  const batch = matrix.slice(claimed.startIndex, claimed.endIndex);
  const results: BatchComboResult[] = [];
  const errors: BatchComboError[] = [];

  // The cursor is already claimed at this point (avoids duplicate work under
  // concurrency), so failures are reported per-combo instead of aborting the
  // run — nothing here silently disappears.
  for (const combo of batch) {
    try {
      const outcome = await collectAndSave(combo.keyword, combo.zone, combo.specialty, apiKey);
      results.push({ keyword: combo.keyword, zone: combo.zone, specialty: combo.specialty, ...outcome });
    } catch (error) {
      errors.push({
        keyword: combo.keyword,
        zone: combo.zone,
        specialty: combo.specialty,
        error: (error as Error).message,
      });
    }
  }

  return {
    done: false,
    processed: results.length,
    failed: errors.length,
    nextIndex: claimed.endIndex,
    totalCombinations: matrix.length,
    results,
    errors,
  };
}
