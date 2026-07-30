import * as admin from "firebase-admin";

export async function logAccess(ip: string, route: string, result: number): Promise<void> {
  try {
    await admin.firestore().collection("access_log").add({
      ip,
      ruta: route,
      resultado: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to write access_log", error);
  }
}

