import type { Request, Response } from "express";
import { collectAndSave } from "./services/collectionService";

export async function collectDoctorsHandler(req: Request, res: Response): Promise<void> {
  const keyword = req.query.keyword as string | undefined;
  const zone = req.query.zona as string | undefined;
  const specialty = req.query.especialidad as string | undefined;

  if (!keyword || !zone || !specialty) {
    res.status(400).json({ error: "keyword, zona and especialidad are required" });
    return;
  }

  const apiKey = process.env.PLACES_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "PLACES_API_KEY not configured" });
    return;
  }

  try {
    const outcome = await collectAndSave(keyword, zone, specialty, apiKey);
    res.status(200).json({
      run_id: outcome.runId,
      results_total: outcome.resultsTotal,
      results_new: outcome.resultsNew,
      results_duplicated: outcome.resultsDuplicated,
      api_calls: outcome.apiCalls,
    });
  } catch (error) {
    res.status(502).json({ error: "Failed to query Places API", detail: (error as Error).message });
  }
}
