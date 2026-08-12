import type { Request, Response } from "express";
import { backfillZones } from "./services/backfillZonesService";

export async function backfillZonesHandler(_req: Request, res: Response): Promise<void> {
  try {
    const summary = await backfillZones();
    res.status(200).json(summary);
  } catch (error) {
    res.status(500).json({ error: "Backfill failed", detail: (error as Error).message });
  }
}
