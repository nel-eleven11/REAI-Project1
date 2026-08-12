import type { Request, Response } from "express";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { computeCoverageStats } from "./services/coverageStatsService";

export const computeCoverageStatsScheduled = onSchedule("every day 04:00", async () => {
  const stats = await computeCoverageStats();
  console.log(`computeCoverageStats: ${stats.length} zona x especialidad cells updated`);
});

// Manual trigger (protected by ipWhitelist, mounted under collectApp) so the
// heatmap doesn't have to wait for the 04:00 scheduler after fresh collection.
export async function computeCoverageStatsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const stats = await computeCoverageStats();
    res.status(200).json({ cells_updated: stats.length });
  } catch (error) {
    res.status(500).json({ error: "Failed to compute coverage stats", detail: (error as Error).message });
  }
}
