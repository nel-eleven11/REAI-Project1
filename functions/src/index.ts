import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import express from "express";
import { ipWhitelist } from "./middleware/ipWhitelist";

admin.initializeApp();

export const helloWorld = onRequest((req, res) => {
  res.status(200).send("Hola mundo, Diego Pablo");
});

const directorioApp = express();
directorioApp.use(ipWhitelist(process.env.IP_WHITELIST));

directorioApp.get("/directorio", (req, res) => {
  // TODO: paginacion (page, pageSize <= 50), filtros especialidad y zona
  res.status(200).json({ results: [], page: 1, pageSize: 20 });
});

export const obtenerDirectorio = onRequest(directorioApp);
