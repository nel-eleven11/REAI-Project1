# Guía: qué se rompió en el primer deploy real y cómo se resolvió

Cada integrante va a desplegar a su propio proyecto GCP. Es casi seguro que se topen con los mismos problemas — esta guía documenta qué pasó, por qué, y cómo se arregló, en orden.

## 1. App Check bloqueaba el deploy (a propósito)

`firebase.json` tiene un predeploy (`functions/scripts/check-app-check-enforce.js`) que aborta el deploy si `APP_CHECK_ENFORCE=true` no está configurado para un proyecto real (no `demo-*`). Es intencional — evita desplegar con App Check inerte sin darse cuenta.

**Solución:**
1. Firebase Console → Project Settings → General → registrar una app web (da el bloque `firebaseConfig`).
2. Firebase Console → App Check → Apps → tu app web → Register → reCAPTCHA v3.
3. [google.com/recaptcha/admin/create](https://www.google.com/recaptcha/admin/create) → tipo v3 → dominios: `<tu-proyecto>.web.app`, `<tu-proyecto>.firebaseapp.com`, `localhost` → te da **site key** (pública) y **secret key** (privada).
4. Secret key → pégala en el campo que pide Firebase App Check.
5. `cp public/config.example.js public/config.js` → llena `firebase` (paso 1) y `appCheckSiteKey` (site key del paso 3).
6. `functions/.env.<tu-project-id>` (no `functions/.env` a secas — ver punto 3) con `APP_CHECK_ENFORCE=true`.

## 2. El primer `firebase deploy` terminó en error, pero SÍ desplegó

El error final fue por falta de política de limpieza de imágenes en Artifact Registry (Cloud Functions genera una imagen de contenedor por deploy; sin política, se acumulan y cobran storage). Functions, Firestore y el upload de Hosting ya habían terminado bien — solo faltó:

```bash
firebase functions:artifacts:setpolicy
```

Y como el proceso murió antes de "finalizar" el release de Hosting, el sitio quedó con archivos subidos pero sin publicar (`Site Not Found`). Se resolvió con:

```bash
firebase deploy --only hosting
```

**Lección:** si `firebase deploy` termina en error, revisa el log completo — puede que solo falte el último paso, no que todo haya fallado.

## 3. `functions/.env` se carga para TODOS los proyectos, incluido `demo-test`

Firebase Functions v2 carga `.env` (sin sufijo) para cualquier proyecto. Si ahí pones config real (API key, `APP_CHECK_ENFORCE=true`), esos valores **también se cargan durante `npm run test:emulator`** — rompiendo los tests locales sin que el código haya cambiado.

**Regla:** nunca usar `functions/.env` a secas para config real. Usar `functions/.env.<project-id>` (solo aplica a ese proyecto específico). `functions/.gitignore` ya bloquea cualquier `.env.*` real excepto `.env.demo-test` (el que usa CI, sin secretos).

## 4. La IP whitelist bloqueaba tráfico real, dejaba pasar el spoof

Este fue el más sutil. La UI llama a `/directorio`, `/coverage`, `/correcciones` **mismo origen** a través de Firebase Hosting (ver `firebase.json` → `rewrites`). Hosting actúa como proxy: agrega la IP real del visitante a `X-Forwarded-For`, y luego Cloud Functions (GFE) agrega encima la IP propia de Hosting — **dos saltos**, no uno.

Confirmado en producción: pegarle a `https://<proyecto>.web.app/directorio` mostraba `66.102.8.200` (IP de Google) como IP "detectada" — la whitelist rechazaba al visitante real y, de paso, un atacante podía poner la IP whitelisteada como primer valor falso y colarse.

`recolectarMedicos`/`runCollectionBatch` no tienen rewrite de Hosting — se invocan directo contra la URL de Cloud Functions, un solo salto.

**Solución:** `extractClientIp(req, trustedHops)` — 2 saltos para las rutas detrás de Hosting, 1 para las de invocación directa. Ver `functions/src/index.ts` y `functions/src/utils/clientIp.ts`.

**Si tu IP cambia** (común en redes residenciales): actualiza `IP_WHITELIST` en `functions/.env.<tu-project-id>` y vuelve a correr `firebase deploy --only functions`.

## 5. La API key de Places, restringida por IP, rechazaba las llamadas del propio servidor

La key se restringió en Semana 1 a la IP del desarrollador (para pruebas locales con `curl`/emulador, donde el código corre en tu laptop y la llamada sale con tu IP). Pero la función **desplegada** corre en infraestructura de Google — la llamada a Places API sale desde una IP dinámica de Google, nunca la tuya.

Dos soluciones posibles:
- **Cloud NAT + VPC connector** con IP estática reservada, agregada a la whitelist de la key. Correcto pero cuesta ~$10-15/mes mientras exista la infraestructura.
- **Quitar la restricción por IP, dejar solo la restricción por API** (Places API únicamente). Sin costo extra. La protección de presupuesto real sigue siendo la cuota diaria (punto 6).

Para un proyecto de alcance académico de pocos días, se optó por la segunda:

```bash
gcloud services api-keys update <key-id> --project=<proyecto> --clear-restrictions
gcloud services api-keys update <key-id> --project=<proyecto> --api-target=service=places-backend.googleapis.com
```

## 6. La cuota diaria de 50 llamadas SÍ frenó la recolección — funcionando como se diseñó

Cada combinación de `runCollectionBatch` cuesta ~21 llamadas (1 Text Search + hasta 20 Place Details). Después de ~3-4 combinaciones se agotó la cuota de 50/día y Places devolvió `OVER_QUERY_LIMIT`. Esto no es un bug — es la protección de presupuesto de Semana 1 haciendo exactamente su trabajo. Se resetea a diario; para recolectar más rápido, se sube la cuota en consola (APIs & Services → Cuotas).

## Checklist rápido para el siguiente integrante

1. `firebase login`
2. Registrar app web + App Check + reCAPTCHA v3 → `public/config.js`
3. `functions/.env.<tu-project-id>` con `PLACES_API_KEY`, `IP_WHITELIST` (tu IP real), `APP_CHECK_ENFORCE=true`
4. Places API key: restringir solo por API (Places), no por IP — o montar NAT si de verdad necesitas mantener la restricción por IP
5. `firebase deploy`
6. Si termina en error de Artifact Registry: `firebase functions:artifacts:setpolicy` + `firebase deploy --only hosting`
7. Probar `/directorio` a través de la URL de Hosting (no la URL directa de Cloud Functions) — así se prueba la topología real
8. `runCollectionBatch?batchSize=2` para poblar datos reales, respetando la cuota diaria
