import { randomUUID } from "crypto";
import { searchPlaces } from "./placesClient";
import { saveDoctors, saveCollectionRun } from "./doctorsRepo";

export interface CollectionOutcome {
  runId: string;
  resultsTotal: number;
  resultsNew: number;
  resultsDuplicated: number;
  apiCalls: number;
}

export async function collectAndSave(
  keyword: string,
  zone: string,
  specialty: string,
  apiKey: string
): Promise<CollectionOutcome> {
  const runId = randomUUID();
  const { places, apiCalls } = await searchPlaces(keyword, apiKey);
  const saveResult = await saveDoctors(places, keyword, zone, specialty, runId);
  await saveCollectionRun(runId, keyword, zone, apiCalls, saveResult);

  return {
    runId,
    resultsTotal: places.length,
    resultsNew: saveResult.resultsNew,
    resultsDuplicated: saveResult.resultsDuplicated,
    apiCalls,
  };
}
