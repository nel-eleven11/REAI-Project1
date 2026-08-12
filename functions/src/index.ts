import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import express from "express";
import { ipWhitelist } from "./middleware/ipWhitelist";
import { appCheckGuard } from "./middleware/appCheck";
import { collectDoctorsHandler } from "./collectDoctors";
import { runCollectionBatchHandler, resetCollectionProgressHandler } from "./runCollectionBatch";
import { getDirectoryHandler } from "./getDirectory";
import { getCoverageHandler } from "./getCoverage";
import { submitCorrectionHandler } from "./submitCorrection";
import { backfillZonesHandler } from "./backfillZones";
import { computeCoverageStatsHandler } from "./computeCoverageStats";
import { dataCardStatsHandler } from "./dataCardStats";

admin.initializeApp();

// Off by default so emulator/CI requests (no token) still pass; see README.
const appCheckEnforce = process.env.APP_CHECK_ENFORCE === "true";

if (!appCheckEnforce && process.env.FUNCTIONS_EMULATOR !== "true") {
  console.warn(
    "APP_CHECK_ENFORCE is not 'true' in a deployed (non-emulator) environment — App Check is not enforced."
  );
}

export const helloWorld = onRequest((req, res) => {
  res.status(200).send("Hello world, Diego Pablo");
});

// Reached through the Firebase Hosting rewrite (firebase.json) — the UI
// calls same-origin — so there are two trusted X-Forwarded-For hops
// (Hosting + GFE), not one. Confirmed against real production traffic.
const HOSTING_TRUSTED_HOPS = 2;

const directoryApp = express();
directoryApp.use(ipWhitelist(process.env.IP_WHITELIST, HOSTING_TRUSTED_HOPS));
directoryApp.use(appCheckGuard(appCheckEnforce));
directoryApp.get("/directorio", getDirectoryHandler);

export const getDirectory = onRequest(directoryApp);

const coverageApp = express();
coverageApp.use(ipWhitelist(process.env.IP_WHITELIST, HOSTING_TRUSTED_HOPS));
coverageApp.use(appCheckGuard(appCheckEnforce));
coverageApp.get("/coverage", getCoverageHandler);

export const getCoverage = onRequest(coverageApp);

// No Hosting rewrite for these — invoked directly against the Cloud
// Function URL, so only one trusted hop (GFE).
const collectApp = express();
collectApp.use(ipWhitelist(process.env.IP_WHITELIST));
collectApp.get("/recolectarMedicos", collectDoctorsHandler);
collectApp.get("/runCollectionBatch", runCollectionBatchHandler);
collectApp.get("/backfillZones", backfillZonesHandler);
collectApp.get("/computeCoverageStats", computeCoverageStatsHandler);
collectApp.get("/resetCollectionProgress", resetCollectionProgressHandler);
collectApp.get("/dataCardStats", dataCardStatsHandler);

export const collectDoctors = onRequest(collectApp);

const correctionsApp = express();
correctionsApp.use(express.json());
correctionsApp.use(appCheckGuard(appCheckEnforce));
// No IP whitelist: must be reachable by anyone (plan.md section 12); rate-limited instead.
correctionsApp.post("/correcciones", submitCorrectionHandler);

export const submitCorrection = onRequest(correctionsApp);

export { purgeExpiredRecordsScheduled } from "./purgeExpiredRecords";
export { computeCoverageStatsScheduled } from "./computeCoverageStats";

