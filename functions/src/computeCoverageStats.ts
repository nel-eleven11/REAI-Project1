import { onSchedule } from "firebase-functions/v2/scheduler";
import { computeCoverageStats } from "./services/coverageStatsService";

// Coverage and bias audit (plan.md section 7): precomputes the zona x
// especialidad matrix daily so the UI/heatmap doesn't have to aggregate the
// whole medicos collection on every load.
export const computeCoverageStatsScheduled = onSchedule("every day 04:00", async () => {
  const stats = await computeCoverageStats();
  console.log(`computeCoverageStats: ${stats.length} zona x especialidad cells updated`);
});
