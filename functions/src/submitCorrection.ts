import * as admin from "firebase-admin";
import type { Request, Response } from "express";
import type { Correction, CorrectionType } from "./types/doctor";
import { checkRateLimit } from "./services/rateLimiter";

function extractClientIp(req: Request): string {
  // Same logic as ipWhitelist.ts: the Cloud Functions proxy APPENDS the real
  // IP as the last entry of x-forwarded-for; everything before that is
  // client-supplied and spoofable.
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    const ips = forwardedFor.split(",").map((ip) => ip.trim());
    return ips[ips.length - 1];
  }
  return req.ip ?? req.socket?.remoteAddress ?? "";
}

const VALID_TYPES: CorrectionType[] = ["correccion", "remocion"];

export async function submitCorrectionHandler(req: Request, res: Response): Promise<void> {
  const ip = extractClientIp(req);

  const allowed = await checkRateLimit(ip);
  if (!allowed) {
    res.status(429).json({ error: "Too many requests, try again later" });
    return;
  }

  const { place_id: placeId, tipo, mensaje } = req.body ?? {};

  if (typeof placeId !== "string" || !placeId) {
    res.status(400).json({ error: "place_id is required" });
    return;
  }
  if (typeof tipo !== "string" || !VALID_TYPES.includes(tipo as CorrectionType)) {
    res.status(400).json({ error: "tipo must be 'correccion' or 'remocion'" });
    return;
  }
  if (typeof mensaje !== "string" || !mensaje.trim()) {
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

  const isRemoval = tipo === "remocion";

  // Removal: applied automatically and immediately. We prioritize the data
  // subject over directory completeness (plan.md section 12) — the cost of
  // over-removing is low compared to ignoring someone who never consented to
  // appear. The document in `correcciones` with ip+timestamp is the
  // auditable trail to revert if this is abused.
  //
  // Correction (data edit): NOT applied automatically. A wrong data point
  // published without verification could harm a patient; it's left pending
  // for human review.
  const correction: Correction = {
    place_id: placeId,
    tipo: tipo as CorrectionType,
    mensaje: mensaje.trim(),
    estado: isRemoval ? "aplicada" : "pendiente",
    created_at: new Date().toISOString(),
    ip,
  };

  const correctionRef = db.collection("correcciones").doc();

  if (isRemoval) {
    const batch = db.batch();
    batch.set(correctionRef, correction);
    // suppressed must survive future re-collections — doctorsRepo.ts never
    // resets it here, it only initializes it the first time the doc is created.
    batch.update(doctorRef, { suppressed: true });
    await batch.commit();
  } else {
    await correctionRef.set(correction);
  }

  res.status(201).json({ id: correctionRef.id, estado: correction.estado });
}
