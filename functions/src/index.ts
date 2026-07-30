import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import express from "express";
import { ipWhitelist } from "./middleware/ipWhitelist";
import { appCheckGuard } from "./middleware/appCheck";
import { collectDoctorsHandler } from "./collectDoctors";
import { runCollectionBatchHandler } from "./runCollectionBatch";
import { getDirectoryHandler } from "./getDirectory";
import { getCoverageHandler } from "./getCoverage";
import { submitCorrectionHandler } from "./submitCorrection";

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

const directoryApp = express();
directoryApp.use(ipWhitelist(process.env.IP_WHITELIST));
directoryApp.use(appCheckGuard(appCheckEnforce));
directoryApp.get("/directorio", getDirectoryHandler);

export const getDirectory = onRequest(directoryApp);

const coverageApp = express();
coverageApp.use(ipWhitelist(process.env.IP_WHITELIST));
coverageApp.use(appCheckGuard(appCheckEnforce));
coverageApp.get("/coverage", getCoverageHandler);

export const getCoverage = onRequest(coverageApp);

const collectApp = express();
collectApp.use(ipWhitelist(process.env.IP_WHITELIST));
collectApp.get("/recolectarMedicos", collectDoctorsHandler);
collectApp.get("/runCollectionBatch", runCollectionBatchHandler);

export const collectDoctors = onRequest(collectApp);

const correctionsApp = express();
correctionsApp.use(express.json());
correctionsApp.use(appCheckGuard(appCheckEnforce));
// No IP whitelist: must be reachable by anyone (plan.md section 12); rate-limited instead.
correctionsApp.post("/correcciones", submitCorrectionHandler);

export const submitCorrection = onRequest(correctionsApp);

export { purgeExpiredRecordsScheduled } from "./purgeExpiredRecords";
export { computeCoverageStatsScheduled } from "./computeCoverageStats";

