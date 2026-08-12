# REAI-Project1

Directorio de Médicos Especialistas — Ciudad de Guatemala. Ver [plan.md](plan.md) para el detalle completo del proyecto.

## Setup por integrante

Cada miembro del equipo usa **su propia cuenta de Google Cloud y su propio proyecto Firebase** (billing individual). Nada de eso vive en el repo compartido.

1. Clonar el repo.
2. Crear tu proyecto en [Firebase Console](https://console.firebase.google.com) (o `gcloud projects create`).
3. Copiar los templates de config local:
   ```bash
   cp .env.example .env
   cp .firebaserc.example .firebaserc
   ```
4. Editar `.env` con tu `GCP_PROJECT_ID` y demás valores.
5. Editar `.firebaserc` con el `projectId` de tu propio proyecto — o generarlo directo con:
   ```bash
   firebase login
   firebase use --add
   ```
   (esto pregunta qué proyecto usar y escribe `.firebaserc` por ti).
6. Instalar dependencias de functions:
   ```bash
   cd functions && npm install
   ```
7. Levantar el emulador (sin costo de API):
   ```bash
   npm --prefix functions run serve
   ```

`.env` y `.firebaserc` están en `.gitignore` — son config local de cada máquina/cuenta, nunca se commitean.

## Recolección de datos

Estrategia de keywords documentada en [docs/keyword-strategy.md](docs/keyword-strategy.md). Dos formas de recolectar:

- `GET /recolectarMedicos?keyword=&zona=&especialidad=` — una búsqueda puntual manual.
- `GET /runCollectionBatch?batchSize=N` — recorre la matriz balanceada completa (576 combinaciones) en lotes, con un cursor compartido en `collection_progress/state` para que cualquier integrante siga donde otro dejó, sin repetir búsquedas.

Ambas comparten IP whitelist y consumen la cuota diaria de Places API.

## UI (Semana 3)

La UI vive en `public/` como HTML/CSS/JS plano (sin framework ni build step) y se sirve con Firebase
Hosting. `firebase.json` reescribe `/directorio`, `/coverage` y `/correcciones` hacia las Cloud
Functions correspondientes, así que la UI funciona igual en el emulador y en producción.

1. Copiar el template de config local del frontend:
   ```bash
   cp public/config.example.js public/config.js
   ```
2. Levantar el emulador (functions + firestore + hosting):
   ```bash
   npm --prefix functions run serve
   ```
3. Abrir `http://127.0.0.1:5050` — el hosting emulado sirve `public/` y reescribe las llamadas a
   `/directorio`, `/coverage` y `/correcciones` hacia el emulador de Functions. (El puerto de
   Hosting es 5050, no el 5000 por defecto de Firebase, porque 5000 suele estar ocupado por
   AirPlay/ControlCenter en macOS — ver `firebase.json` → `emulators.hosting.port`.)


La UI incluye:
- Buscador con filtros de especialidad/zona y tabla paginada (tope de 50 resultados/página, igual
  que el backend).
- Badge de antigüedad del dato por registro (verde/ámbar/rojo según días desde `fecha_recoleccion`).
- Aviso permanente de "no valida credenciales médicas" (plan.md sección 13).
- Formulario de corrección/remoción que llama a `POST /correcciones`.
- Heatmap de cobertura zona × especialidad, leyendo `GET /coverage` (plan.md sección 7).
- Un throttle de UX en los botones de buscar/enviar (deshabilitados brevemente tras el submit) —
  esto es **solo cosmético**, no es un control de seguridad. El rate limit real está en el backend
  (`functions/src/services/rateLimiter.ts` para `/correcciones`, IP whitelist para `/directorio` y
  `/coverage`).

### App Check setup (defensa en profundidad, plan.md sección 11)

Por defecto el proyecto corre con una site key de reCAPTCHA v3 de placeholder
(`public/config.js` → `appCheckSiteKey: "REPLACE_ME_RECAPTCHA_V3_SITE_KEY"`). Con el placeholder,
la UI simplemente no adjunta el header `X-Firebase-AppCheck`, y el backend (controlado por
`APP_CHECK_ENFORCE`, default `false`) no rechaza nada — sigue funcionando igual que hoy.

Para activar App Check de verdad:

1. En Firebase Console → **App Check** → registrar tu app web con el proveedor **reCAPTCHA v3**
   (esto genera una site key).
2. Copiar esa site key a `public/config.js` (`appCheckSiteKey`) y llenar también el bloque
   `firebase` con la config del SDK web de tu proyecto (Project Settings → General → Your apps).
3. En `functions/.env` (o la config de env vars del deploy), poner `APP_CHECK_ENFORCE=true` para
   que `/directorio`, `/coverage` y `/correcciones` empiecen a exigir un token válido.
4. Redeploy de functions y hosting.

Mientras no se complete este setup, la whitelist de IP sigue siendo el control principal — App
Check es una capa adicional, no un reemplazo (ver plan.md sección 11, "Limitaciones documentadas").

**Gate de despliegue:** `firebase.json` corre `functions/scripts/check-app-check-enforce.js` como
predeploy. Si el proyecto destino no es uno demo (`demo-*`, solo emulador) y no encuentra
`APP_CHECK_ENFORCE=true` en `functions/.env` o `functions/.env.<project-id>`, **aborta el deploy**
en vez de dejar pasar el hueco silenciosamente a producción.

## Pruebas end-to-end

Además de las pruebas unitarias/de integración por endpoint (`functions/test/*.test.js`), hay un
recorrido end-to-end en `functions/test/e2e.test.js` que simula el flujo completo: un registro se
recolecta → aparece en `/directorio` → se solicita su remoción vía `/correcciones` → deja de
aparecer en `/directorio` → `/coverage` sigue respondiendo. Corre con el resto de la suite:

```bash
npm --prefix functions run test:emulator
```

### Checklist manual contra producción

Correr pruebas automatizadas contra producción consume cuota real de la API de Places, así que el
flujo e2e completo contra producción es un checklist manual antes de la demo, no un script en CI:

- [ ] Desplegar functions + hosting + firestore rules/indexes al proyecto real (`firebase deploy`).
- [ ] Confirmar que `GET /directorio` responde 403 desde una IP no autorizada.
- [ ] Confirmar que `GET /directorio` responde 200 con datos desde la IP whitelisteada real.
- [ ] Abrir la UI en la URL de Hosting y verificar que el buscador, la tabla y el heatmap cargan.
- [ ] Enviar una remoción de prueba desde la UI y confirmar que el registro desaparece del
      buscador en la siguiente búsqueda.
- [ ] Revisar `access_log` en Firestore y confirmar que quedaron registradas entradas de
      `/directorio` (200/403) y de `/correcciones` (201/400/404/429).
- [ ] Confirmar que `purgeExpiredRecordsScheduled` y `computeCoverageStatsScheduled` aparecen
      programadas en Cloud Scheduler.

