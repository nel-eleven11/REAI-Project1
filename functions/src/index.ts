import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import express from "express";
import { ipWhitelist } from "./middleware/ipWhitelist";
import { collectDoctorsHandler } from "./collectDoctors";
import { getDirectoryHandler } from "./getDirectory";
import { submitCorrectionHandler } from "./submitCorrection";

admin.initializeApp();

export const helloWorld = onRequest((req, res) => {
  res.status(200).send("Hello world, Diego Pablo");
});

const directoryApp = express();
directoryApp.use(ipWhitelist(process.env.IP_WHITELIST));
directoryApp.get("/directorio", getDirectoryHandler);

export const getDirectory = onRequest(directoryApp);

const collectApp = express();
collectApp.use(ipWhitelist(process.env.IP_WHITELIST));
collectApp.get("/recolectarMedicos", collectDoctorsHandler);

export const collectDoctors = onRequest(collectApp);

const correctionsApp = express();
correctionsApp.use(express.json());
// No IP whitelist: /correcciones must be reachable by anyone whose data
// appears in the directory (plan.md section 12), protected instead by the
// Firestore-backed rate limiter (services/rateLimiter.ts).
correctionsApp.post("/correcciones", submitCorrectionHandler);

export const submitCorrection = onRequest(correctionsApp);

export { purgeExpiredRecordsScheduled } from "./purgeExpiredRecords";
export { computeCoverageStatsScheduled } from "./computeCoverageStats";
