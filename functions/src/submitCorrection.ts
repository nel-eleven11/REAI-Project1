import * as admin from "firebase-admin";
import type { Request, Response } from "express";
import type { Correction, CorrectionType } from "./types/doctor";
import { checkRateLimit } from "./services/rateLimiter";
import { extractClientIp } from "./utils/clientIp";
import { logAccess } from "./services/accessLog";

const VALID_TYPES: CorrectionType[] = ["correccion", "remocion"];

// Reached through the Firebase Hosting rewrite (see firebase.json), same as
// getDirectory/getCoverage — two trusted hops (Hosting + GFE).
export async function submitCorrectionHandler(req: Request, res: Response): Promise<void> {
  const ip = extractClientIp(req, 2);
  const route = req.originalUrl;
  res.on("finish", () => {
    void logAccess(ip, route, res.statusCode);
  });

  const allowed = await checkRateLimit(ip);
  if (!allowed) {
    res.status(429).json({ error: "Too many requests, try again later" });
    return;
  }

  const { place_id: placeId, tipo: correctionType, mensaje: message } = req.body ?? {};

  if (typeof placeId !== "string" || !placeId) {
    res.status(400).json({ error: "place_id is required" });
    return;
  }
  if (typeof correctionType !== "string" || !VALID_TYPES.includes(correctionType as CorrectionType)) {
    res.status(400).json({ error: "tipo must be 'correccion' or 'remocion'" });
    return;
  }
  if (typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "mensaje is required" });
    return;
  }

  const db = admin.firestore();
  const doctorRef = db.collection("medicos").doc(placeId);
  const doctorSnap = await doctorRef.get();
  if (!doctorSnap.exists) {
    res.status(404).json({ error: "place_id not found" });
    return;
  }

  // Removal applies immediately (plan.md section 12); correction stays pending.
  const isRemoval = correctionType === "remocion";

  const correction: Correction = {
    place_id: placeId,
    tipo: correctionType as CorrectionType,
    mensaje: message.trim(),
    estado: isRemoval ? "aplicada" : "pendiente",
    created_at: new Date().toISOString(),
    ip,
  };

  const correctionRef = db.collection("correcciones").doc();

  if (isRemoval) {
    const batch = db.batch();
    batch.set(correctionRef, correction);
    batch.update(doctorRef, { suppressed: true });
    await batch.commit();
  } else {
    await correctionRef.set(correction);
  }

  res.status(201).json({ id: correctionRef.id, estado: correction.estado });
}
