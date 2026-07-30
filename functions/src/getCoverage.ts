import type { Request, Response } from "express";
import { readCoverageStats } from "./services/coverageStatsService";

export async function getCoverageHandler(_req: Request, res: Response): Promise<void> {
  try {
    const stats = await readCoverageStats();
    res.status(200).json({ results: stats });
  } catch (error) {
    res.status(500).json({ error: "Failed to read coverage stats", detail: (error as Error).message });
  }
}
