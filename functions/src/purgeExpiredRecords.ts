import { onSchedule } from "firebase-functions/v2/scheduler";
import { purgeExpiredRecords } from "./services/purgeService";

// ToS compliance (plan.md section 6): runs daily, refreshes what can be
// re-queried by place_id and purges content for what can't.
export const purgeExpiredRecordsScheduled = onSchedule("every day 03:00", async () => {
  const summary = await purgeExpiredRecords(process.env.PLACES_API_KEY);
  console.log("purgeExpiredRecords summary:", summary);
});
