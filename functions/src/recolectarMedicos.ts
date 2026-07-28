import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import { searchPlaces } from "./services/placesClient";
import { saveMedicos, saveCollectionRun } from "./services/medicosRepo";

export async function recolectarMedicosHandler(req: Request, res: Response): Promise<void> {
  const keyword = req.query.keyword as string | undefined;
  const zona = req.query.zona as string | undefined;
  const especialidad = req.query.especialidad as string | undefined;

  if (!keyword || !zona || !especialidad) {
    res.status(400).json({ error: "keyword, zona y especialidad son requeridos" });
    return;
  }

  const apiKey = process.env.PLACES_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "PLACES_API_KEY no configurada" });
    return;
  }

  const runId = randomUUID();

  try {
    const { places, apiCalls } = await searchPlaces(keyword, apiKey);
    const saveResult = await saveMedicos(places, keyword, zona, especialidad, runId);
    await saveCollectionRun(runId, keyword, zona, apiCalls, saveResult);

    res.status(200).json({
      run_id: runId,
      results_total: places.length,
      results_new: saveResult.resultsNew,
      results_duplicated: saveResult.resultsDuplicated,
      api_calls: apiCalls,
    });
  } catch (error) {
    res.status(502).json({ error: "Fallo al consultar Places API", detail: (error as Error).message });
  }
}
