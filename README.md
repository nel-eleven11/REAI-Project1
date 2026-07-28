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
