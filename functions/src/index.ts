import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import express from "express";
import { ipWhitelist } from "./middleware/ipWhitelist";
import { appCheckGuard } from "./middleware/appCheck";
import { collectDoctorsHandler } from "./collectDoctors";
import { getDirectoryHandler } from "./getDirectory";
import { getCoverageHandler } from "./getCoverage";
import { submitCorrectionHandler } from "./submitCorrection";

admin.initializeApp();

// Defense in depth (plan.md section 11): App Check is a second, independent
// signal on top of the IP whitelist. Off by default (APP_CHECK_ENFORCE
// unset) so the emulator/CI tests, which don't send a token, keep passing.
// Flip to "true" per-environment once a real reCAPTCHA site key is wired up
// in the UI (see README "App Check setup").
const appCheckEnforce = process.env.APP_CHECK_ENFORCE === "true";

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

export const collectDoctors = onRequest(collectApp);

const correctionsApp = express();
correctionsApp.use(express.json());
correctionsApp.use(appCheckGuard(appCheckEnforce));
// No IP whitelist: /correcciones must be reachable by anyone whose data
// appears in the directory (plan.md section 12), protected instead by the
// Firestore-backed rate limiter (services/rateLimiter.ts).
correctionsApp.post("/correcciones", submitCorrectionHandler);

export const submitCorrection = onRequest(correctionsApp);

export { purgeExpiredRecordsScheduled } from "./purgeExpiredRecords";
export { computeCoverageStatsScheduled } from "./computeCoverageStats";

