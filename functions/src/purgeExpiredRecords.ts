import { onSchedule } from "firebase-functions/v2/scheduler";
import { purgeExpiredRecords } from "./services/purgeService";

// ToS compliance (plan.md section 6).
export const purgeExpiredRecordsScheduled = onSchedule("every day 03:00", async () => {
  const summary = await purgeExpiredRecords(process.env.PLACES_API_KEY);
  console.log("purgeExpiredRecords summary:", summary);
});
