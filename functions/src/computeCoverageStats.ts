import { onSchedule } from "firebase-functions/v2/scheduler";
import { computeCoverageStats } from "./services/coverageStatsService";

export const computeCoverageStatsScheduled = onSchedule("every day 04:00", async () => {
  const stats = await computeCoverageStats();
  console.log(`computeCoverageStats: ${stats.length} zona x especialidad cells updated`);
});
