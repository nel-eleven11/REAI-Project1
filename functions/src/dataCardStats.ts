import type { Request, Response } from "express";
import { computeDataCardStats } from "./services/dataCardStatsService";

export async function dataCardStatsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const stats = await computeDataCardStats();
    res.status(200).json(stats);
  } catch (error) {
    res.status(500).json({ error: "Failed to compute data card stats", detail: (error as Error).message });
  }
}
