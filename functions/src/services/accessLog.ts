import * as admin from "firebase-admin";

export async function logAccess(ip: string, ruta: string, resultado: number): Promise<void> {
  try {
    await admin.firestore().collection("access_log").add({
      ip,
      ruta,
      resultado,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to write access_log", error);
  }
}
