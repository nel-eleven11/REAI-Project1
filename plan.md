# Plan de Proyecto: Directorio de Médicos Especialistas

**Cliente:** Ministerio de Educación de Guatemala
**Equipo:** 4 personas
**Duración:** 4 semanas
**Stack:** TypeScript · Firebase Functions v2 · Firestore · Google Places API · Firebase Hosting

---

## 1. Objetivo

Sistema que recolecta, almacena y expone datos de médicos especialistas en Ciudad de Guatemala (nombre, especialidad, dirección, teléfono, sitio web) usando Google Places API, con API paginada protegida por IP whitelist y UI mínima de consulta.

**Objetivo ampliado:** no entregamos solo un directorio, entregamos una **auditoría de la fuente de datos**. El sistema mide y documenta sus propios sesgos, cumple los ToS de Google en código (no solo en prosa) y expone mecanismos de corrección para las personas cuyos datos aparecen.

---

## 2. Tesis del Proyecto

Tres afirmaciones que sostenemos con código y números, no con párrafos:

1. **Cumplimiento verificable.** Los ToS de Google Maps Platform limitan el almacenamiento de contenido de Places a 30 días. Lo implementamos con TTL y purga automática.
2. **La fuente no es neutral.** Google Places sobrerrepresenta zonas con presencia digital. Lo medimos con nuestros propios datos y publicamos el hallazgo.
3. **La IP whitelist es insuficiente.** La implementamos porque se pide, documentamos su modelo de amenazas y agregamos defensa en profundidad.

---

## 3. Arquitectura General

```
[UI Firebase Hosting] --> [getDirectory: GET /directorio] --> [IP Whitelist + Rate Limit] --> [Firestore]
        |                                                              |
        |                                                       403 + access_log
        |
        +--> [submitCorrection: POST /correcciones] --> [cola de revisión / blocklist]

[collectDoctors] --(keyword, zona)--> [Google Places API] --> [medicos + collection_runs]

[Scheduler diario] --> [purgeExpiredRecordsScheduled]   (cumplimiento ToS 30 días)
[Scheduler diario] --> [computeCoverageStatsScheduled]  (auditoría de cobertura/sesgo)
```

### Colecciones Firestore

```
medicos/{place_id}
  nombre
  especialidad_raw            # especialidad usada para la búsqueda, nunca se sobrescribe
  especialidad_normalizada    # derivada de `nombre` por reglas determinísticas | null, ver sección 9
  confidence                  # 0.9 si hubo match, 0 si no | null
  direccion
  telefono        | null
  sitio_web       | null
  missing_fields: string[]    # campos ausentes explícitos, nunca cadenas vacías
  zona, lat, lng
  fecha_recoleccion
  expires_at                  # fecha_recoleccion + 30 días (ToS Google)
  run_id                      # trazabilidad a la corrida que lo creó
  keyword_usado
  suppressed: boolean         # true si hubo solicitud de remoción

collection_runs/{run_id}
  keyword, zona, especialidad, timestamp
  api_calls, results_new, results_duplicated
  estimated_cost_usd          # Text Search ($0.032) y Place Details ($0.017) con tarifas distintas

coverage_stats/{zona}_{especialidad}
  searches_run, unique_results
  pct_con_telefono, pct_con_sitio_web
  computed_at

correcciones/{id}
  place_id, tipo (correccion | remocion), mensaje
  estado (pendiente | aplicada | rechazada), created_at

access_log/{id}
  ip, ruta, resultado (200 | 403 | 429), timestamp

rate_limits/{ip}
  count, window_start                    # ventana fija de 60s, usado solo por /correcciones

collection_progress/state
  next_index, updated_at                 # cursor compartido sobre buildKeywordMatrix()
```

### Cloud Functions

| Función | Tipo | Responsabilidad |
|---|---|---|
| `collectDoctors` | HTTP manual `/recolectarMedicos` | keyword + zona → Places API → Firestore. Límite 20 resultados/invocación. Registra `collection_runs`. |
| `collectDoctors` (mismo deploy) | HTTP `/runCollectionBatch` | Recorre `buildKeywordMatrix()` con cursor persistido en `collection_progress`, en lotes de tamaño configurable. |
| `getDirectory` | HTTP GET `/directorio` | Paginado, filtros `especialidad` y `zona`. IP whitelist + App Check. Excluye `suppressed` y expirados. |
| `getCoverage` | HTTP GET `/coverage` | Expone `coverage_stats` precalculado para el heatmap. IP whitelist + App Check. |
| `submitCorrection` | HTTP POST `/correcciones` | Recibe solicitudes de corrección o remoción. Sin IP whitelist (debe ser público); rate limit en Firestore; access_log propio. |
| `purgeExpiredRecordsScheduled` | Scheduled (diaria) | Purga o refresca documentos con `expires_at` vencido. Nunca refresca `suppressed` — los purga directo. Cumplimiento ToS. |
| `computeCoverageStatsScheduled` | Scheduled (diaria) | Precalcula la matriz zona × especialidad para la auditoría de sesgo. |

---

## 4. Roles del Equipo (4 personas)

| Rol | Responsabilidad principal | Entregable diferenciador |
|---|---|---|
| **Infra/Seguridad** | Proyecto GCP/Firebase, billing alerts, cuotas API, IP whitelist, restricción de API key | Modelo de amenazas + `access_log` + rate limit |
| **Recolección de datos** | Función de recolección, estrategia de keywords, calidad de datos | `collection_runs` + telemetría de costo por registro |
| **Backend/API** | Endpoint `/directorio`, paginación, filtros, validaciones | TTL 30 días + purga + endpoint de correcciones |
| **Frontend/Docs** | UI, Hosting, documentación, diagrama | Heatmap de cobertura + Data Card publicada |

Cada integrante configura su propio proyecto GCP y es responsable de su gasto individual.

---

## 5. Setup Previo (antes de escribir código)

1. Crear proyecto Firebase/GCP por integrante.
2. Configurar **alertas de billing** en 50% y 90% del presupuesto → screenshot (entregable Semana 1).
3. Establecer **cuota máxima diaria** de llamadas en consola de APIs (Places API).
4. Restringir la **API key de Places** en consola GCP para que solo funcione desde IPs del proyecto.
5. Guardar API key en variables de entorno (`.env`, nunca en código; agregar a `.gitignore`).
6. Instalar Firebase CLI + emulador local. Regla: 90% del desarrollo en emulador, deploy a prod solo para pruebas finales.
7. Configurar GitHub Actions con emulador de Firebase para pruebas de integración sin costo de API.

---

## 6. Cumplimiento de los ToS de Google Maps Platform

**Restricción real:** los Términos de Servicio de Google Maps Platform permiten almacenar `place_id` de forma indefinida, pero el resto del contenido de Places solo puede cachearse de forma temporal, con un máximo de **30 días calendario consecutivos**.

Un proyecto que guarda nombres, teléfonos y direcciones "para siempre porque es académico" está en incumplimiento. Nuestra implementación:

- Todo documento lleva `expires_at = fecha_recoleccion + 30 días`.
- `purgeExpiredRecords` corre a diario vía Cloud Scheduler:
  - **Refresco:** re-consulta por `place_id` (identificador persistente permitido), reemplaza el contenido y renueva `expires_at`. Nunca se intenta si el documento está `suppressed` — refrescar a alguien que pidió remoción deshace la remoción.
  - **Purga:** si la re-consulta falla, Google confirma que el lugar ya no existe, o falta `PLACES_API_KEY`, se elimina el contenido y se conserva `place_id` + `purge_reason` (`suppressed | no_api_key | not_found_in_places | refresh_error`) — para distinguir "Google confirmó que cerró" de "no teníamos la key configurada", en vez de que ambos casos se vean idénticos en Firestore.
- `obtenerDirectorio` nunca devuelve documentos vencidos, aunque sigan en la base.
- Política TTL de Firestore configurada como red de seguridad sobre `expires_at`.
- Se registra evidencia: log de ejecuciones de purga para mostrar en la demo.

**En la documentación se cita la cláusula específica de los ToS.** Esta es la diferencia entre declarar cumplimiento y demostrarlo.

---

## 7. Auditoría de Cobertura y Sesgo

**Hipótesis:** Google Places no representa Ciudad de Guatemala de forma uniforme. Las clínicas de zonas con mayor poder adquisitivo (10, 14, 15) tienen presencia digital consolidada; zonas como 3, 6, 18 o 21 aparecen subrepresentadas — no porque haya menos médicos, sino porque hay menos digitalización.

**Método:** con los mismos datos que ya recolectamos (costo adicional de API ≈ 0), calculamos por celda zona × especialidad:

- número de búsquedas ejecutadas — contado desde `collection_runs`, no desde `medicos`, para que una zona buscada 10 veces sin resultados se distinga de una zona nunca buscada (si se contara desde `medicos`, ambas se verían idénticas: cero registros)
- resultados únicos obtenidos (excluye `suppressed`: una remoción no debe contar ni en el directorio público ni en las estadísticas agregadas)
- % de registros con teléfono
- % de registros con sitio web

**Entregable:** heatmap en la UI + tabla en la documentación.

**Hallazgo esperado a documentar:**

> El directorio construido a partir de Google Places subrepresenta sistemáticamente las zonas de menor ingreso de Ciudad de Guatemala. Usar este dataset para asignar recursos de salud, planificar cobertura o evaluar oferta médica amplificaría la brecha digital existente: las zonas menos digitalizadas aparecerían como zonas sin médicos.

Esto convierte el proyecto de "recolectamos un directorio" a "auditamos una fuente de datos", que es exactamente el objeto del curso.

---

## 8. Estrategia de Keywords

- Combinar especialidad + zona: `"cardiólogo zona 10 Guatemala"`, `"clínica pediátrica zona 1"`.
- Probar variantes por inconsistencia de nomenclatura en Google Maps: `"médico"`, `"doctor"`, `"clínica"`, `"consultorio"` + especialidad.
- Mantener tabla de especialidades objetivo (cardiología, pediatría, dermatología, ginecología, ortopedia, oftalmología, traumatología, psiquiatría) × zonas relevantes (1–18).
- **Cobertura balanceada obligatoria:** el mismo número de búsquedas por zona, independientemente del rendimiento. Concentrar esfuerzo donde "sí hay resultados" contaminaría la auditoría de la sección 7.
- Registrar cada `keyword_usado` y `run_id` junto al resultado para trazabilidad.
- Deduplicar por `place_id` (idempotente al reinsertar).
- Documentar honestamente campos vacíos — no inventar ni inferir datos.

---

## 9. Normalización de Especialidades (decisión de diseño) — IMPLEMENTADA: Opción A

Google Places no tiene un campo de especialidad médica; lo único disponible es el `nombre` del negocio como texto libre (`"Dr. Juan Pérez - Cardiología y Medicina Interna"`, `"Clínica del Corazón"`, `"Centro Médico Especializado"`).

**Decisión: reglas determinísticas, sin modelo.** Un diccionario de raíces por especialidad (`functions/src/services/specialtyNormalizer.ts`) escanea `nombre` (sin distinguir acentos ni género/número) y, si encuentra una coincidencia, llena `especialidad_normalizada` con confianza 0.9; si no encuentra nada, queda `null` con confianza 0 — nunca se inventa una especialidad.

- `especialidad_raw` sigue siendo la especialidad que se usó para buscar (el término de la matriz de keywords), **no** texto extraído de Google — Google no ofrece ese dato.
- `especialidad_normalizada`/`confidence` son metadata adicional derivada del `nombre`; no se usan para filtrar `/directorio` (eso sigue por `especialidad_raw`), así que no afectan el contrato de la API existente.
- Se descartó la opción B (LLM) por costo/tiempo: requeriría un set de evaluación etiquetado a mano (≥100 registros) y presupuesto de inferencia no contemplado, sin ganancia clara para el alcance de Semana 4.
- Registro de la decisión: una especialidad alucinada puede derivar en daño al paciente; el costo de ese error supera la ganancia de cobertura de un LLM.

---

## 10. Cronograma por Semana

### Semana 1 — Infraestructura y Seguridad (20%)
- [x] Proyecto Firebase/GCP configurado (todos los integrantes)
- [x] Billing alerts activas + screenshot
- [x] Cuota diaria de llamadas API configurada
- [x] Función `hello world` desplegada (Functions v2)
- [x] Middleware de IP whitelist funcionando (403 si IP no autorizada) — probado con IP autorizada, no autorizada y spoof de `X-Forwarded-For`
- [x] `access_log` registrando 403 y 200
- [x] API key en variables de entorno, restringida en GCP
- [x] Repo inicializado, `.gitignore` con `.env`, estructura de carpetas
- [x] CI con emulador de Firebase corriendo en GitHub Actions

### Semana 2 — Recolección y Trazabilidad (20%)
- [x] Función `recolectarMedicos` operativa (límite 20/invocación)
- [x] Colección `collection_runs` registrando keyword, costo estimado, nuevos vs. duplicados
- [x] Estrategia de keywords documentada (tabla especialidad × zona, cobertura balanceada)
- [x] Deduplicación por `place_id` verificada
- [x] `missing_fields` poblado — nunca cadenas vacías
- [x] `expires_at` escrito en cada documento

### Semana 3 — API, Cumplimiento y UI (20%)
- [x] Endpoint `GET /directorio` con paginación (`page`, `pageSize` máx. 50)
- [x] Filtros por `especialidad` y `zona`; excluye expirados y `suppressed`
- [x] `purgeExpiredRecords` implementada y probada contra emulador — [ ] falta desplegar a producción
- [x] `computeCoverageStats` implementada y probada contra emulador — [ ] falta desplegar a producción
- [x] `POST /correcciones` operativo
- [x] UI: buscador, tabla, badge de antigüedad del dato, aviso de "no validación médica"
- [x] Heatmap de cobertura en la UI
- [x] Rate limit por IP + App Check en la UI
- [x] Pruebas end-to-end contra emulador — [ ] falta el checklist manual contra producción (ver README)


### Semana 4 — Documentación y Cierre (25% + 15%)
- [ ] Documentación técnica (máx. 5 páginas)
- [ ] Diagrama de arquitectura
- [ ] **Data Card** del dataset publicada (`/datacard` + PDF)
- [ ] Modelo de amenazas de la IP whitelist
- [ ] Sección "Postura ética" (ver sección 13)
- [ ] Informe de auditoría de cobertura con números reales
- [ ] Telemetría de costo: total, registros únicos, costo por registro
- [ ] Ensayo de presentación (20 min, demo en vivo)

---

## 11. Seguridad y Modelo de Amenazas

Implementamos la IP whitelist como se solicita, y documentamos por qué no basta.

**Implementación:**
- Middleware como primer paso de la request; si falla, retorna 403 sin ejecutar lógica adicional.
- IP real tomada de `X-Forwarded-For`, pero **la posición confiable depende de cómo se invoca la ruta** — confirmado contra producción real, no asumido:
  - `getDirectory`, `getCoverage`, `submitCorrection`: la UI las llama same-origin a través del rewrite de Firebase Hosting (`firebase.json`). Hosting agrega la IP real del cliente, y luego el GFE de Cloud Functions agrega encima la IP propia de Hosting — **dos saltos confiables**, la IP real queda en la **penúltima** posición. Verificado en producción: pegarle directo a `https://rai-proyecto1-502801.web.app/directorio` registraba `66.102.8.200` (IP de Google) como "última" posición — confiar en la última hubiera identificado a cualquier visitante real como la propia infraestructura de Hosting.
  - `recolectarMedicos`, `runCollectionBatch` (función `collectDoctors`): sin rewrite de Hosting, se invocan directo contra la URL de Cloud Functions — **un solo salto**, la IP real es la **última** posición.
  - Todo lo anterior a los saltos confiables es controlado por el cliente y falsificable. `extractClientIp(req, trustedHops)` recibe el número de saltos según cómo se monta cada ruta en `index.ts`.
  - Historial: un intento de "arreglar" esto asumió un External HTTPS Load Balancer (que este proyecto no tiene) y aplicó penúltima posición a *todas* las rutas por igual — eso rompía las rutas de invocación directa. Se corrigió diferenciando por ruta según cómo se invoca realmente cada una, en vez de asumir una sola topología global.
- Toda decisión (200/403/429) se registra en `access_log`.

**Limitaciones documentadas:**

| Debilidad | Impacto | Mitigación aplicada |
|---|---|---|
| `X-Forwarded-For` falsificable si se lee mal, o si se asume el número de saltos incorrecto | Bypass total de la whitelist (o bloqueo de tráfico legítimo) | `extractClientIp(req, trustedHops)` con el conteo de saltos verificado por ruta; tests automatizados con headers falsos por cada topología |
| No hay autenticación, solo ubicación de red | Cualquiera dentro de la IP permitida accede | Rate limit por IP + auditoría |
| IPs dinámicas / red móvil rompen el acceso | Falsos negativos | Documentado como limitación operativa real |
| No protege contra abuso desde IP autorizada | Extracción masiva del dataset | Rate limit + paginación con tope de 50 |

**Defensa en profundidad añadida:** Firebase App Check en la UI, rate limit por IP, `access_log` auditable, API key restringida en consola GCP.

**Cierre del hueco de configuración de App Check:** `APP_CHECK_ENFORCE` no bastaba con existir en código — si nadie lo ponía en `true` al desplegar, quedaba inerte sin ninguna señal visible salvo un log de Cloud Functions que nadie revisa. `firebase.json` ahora corre `functions/scripts/check-app-check-enforce.js` como predeploy: si el proyecto destino no es de emulador (`demo-*`) y falta `APP_CHECK_ENFORCE=true`, **el deploy se aborta**. Declarar la variable ya no es suficiente para "cumplir" — el pipeline lo hace cumplir.

**Alternativa avanzada (opcional):** Cloud Armor — si se implementa, documentar diferencias vs. middleware.

---

## 12. Derechos de los Titulares de Datos

Los médicos listados no consintieron aparecer en este directorio; su información es pública en Google Maps, lo cual no es lo mismo que consentimiento para redistribución.

- `POST /correcciones` permite solicitar corrección o remoción.
- Una remoción marca `suppressed: true`, y la marca **sobrevive a recolecciones futuras** — no reaparece en la siguiente corrida.
- Cola de revisión con estados `pendiente | aplicada | rechazada`.
- La UI muestra el mecanismo de contacto de forma visible, no escondido en un pie de página.

---

## 13. Postura Ética

- **ToS:** cumplimiento de la ventana de 30 días implementado en código (sección 6), no declarado en prosa.
- **No fabricación:** no se agregan ni infieren datos ausentes. Los campos faltantes se guardan como `null` con `missing_fields`, y la UI muestra "No reportado en la fuente" — nunca un espacio en blanco que parezca dato.
- **Sesgo de fuente:** publicamos la auditoría de cobertura y el hallazgo sobre subrepresentación por zona (sección 7).
- **Uso previsto y usos prohibidos:** el directorio es referencia informativa, no validación de credenciales médicas. Se declara explícitamente en UI y Data Card.
- **Frescura:** `fecha_recoleccion` visible en todo dato mostrado o exportado, con antigüedad en días.
- **Derechos de terceros:** mecanismo de corrección y remoción operativo (sección 12).
- **Alcance:** los datos no se redistribuyen como producto independiente; el alcance es estrictamente académico.

### Data Card del dataset

Formato basado en el Data Cards Playbook de Google. Secciones:

1. Motivación y uso previsto
2. Composición (campos, volumen, cobertura geográfica)
3. Procedimiento de recolección (keywords, fechas, costo)
4. Preprocesamiento y normalización
5. **Limitaciones conocidas** (aquí entran los números de la auditoría de cobertura)
6. **Usos prohibidos**
7. Mantenimiento, frescura y política de retención
8. Contacto para correcciones

---

## 14. Telemetría de Costo

`collection_runs` permite reportar números concretos en lugar de "gastamos poco". El costo estimado usa tarifas separadas por tipo de llamada — Text Search (~$0.032) y Place Details (~$0.017) tienen precios distintos en Google Places API, así que sumar todas las llamadas a una sola tarifa subestimaba el gasto real.

- gasto total en USD
- registros únicos obtenidos
- **costo por médico único**
- tasa de duplicados (mide la eficiencia de la estrategia de keywords)
- costo por zona — revela dónde la fuente rinde menos

Estos números entran directo en la presentación y demuestran disciplina de FinOps, no solo que no se reventó el crédito.

---

## 15. Pruebas

- Pruebas de integración contra el emulador de Firebase en GitHub Actions, costo de API cero.
- Casos mínimos cubiertos:
  - IP no autorizada → 403
  - `X-Forwarded-For` falsificado → 403
  - Paginación respeta `pageSize` máx. 50
  - Documento con `expires_at` vencido no aparece en `/directorio`
  - `purgeExpiredRecords` conserva `place_id` y elimina contenido
  - Registro con `suppressed: true` no reaparece tras re-recolección
  - Reinserción del mismo `place_id` no duplica

---

## 16. Riesgos y Mitigaciones

| Riesgo | Mitigación |
|---|---|
| Gasto excede crédito $200 USD | Cuotas diarias + alertas 50/90% + desarrollo en emulador + telemetría de costo por corrida |
| Datos duplicados | `place_id` como ID de documento (upsert natural) |
| Nomenclatura inconsistente en Maps | Estrategia de keywords documentada y probada antes de recolección masiva |
| Exposición de API key | Variables de entorno + restricción por IP en GCP |
| Acceso no autorizado a API | IP whitelist + rate limit + App Check + `access_log` |
| **Incumplimiento de ToS por almacenamiento indefinido** | TTL de 30 días + purga automatizada + política TTL de Firestore |
| **Auditoría de sesgo contaminada por recolección desbalanceada** | Cobertura balanceada obligatoria por zona (sección 8) |
| Purga elimina datos justo antes de la demo | Refresco programado 48h antes; snapshot de respaldo para presentación |

---

## 17. Entregables Finales

1. Documentación técnica (≤5 páginas)
2. Diagrama de arquitectura
3. Sección "Postura ética"
4. **Data Card del dataset**
5. **Informe de auditoría de cobertura** (heatmap + hallazgo)
6. **Modelo de amenazas de la IP whitelist**
7. Repositorio con código fuente (Functions + UI + pruebas + CI)
8. Demo en vivo desplegada en Firebase Hosting
9. Presentación de 20 minutos

---

## 18. Guion de Presentación (20 min)

No demostrar un CRUD. Demostrar el argumento.

| Tiempo | Contenido |
|---|---|
| 1 min | Qué construimos: 1,2XX médicos, $XX.XX, costo por registro |
| 5 min | **Auditamos nuestros propios datos** → heatmap de cobertura → la brecha digital |
| 3 min | **Encontramos un problema de ToS** → ventana de 30 días → purga corriendo en vivo |
| 3 min | Demo de whitelist: 403 en vivo, header falsificado también 403, `access_log` |
| 3 min | Por qué la whitelist no basta → modelo de amenazas |
| 2 min | Data Card + endpoint de correcciones |
| 2 min | **Para qué NO debe usarse este dataset** |
| 1 min | Cierre y preguntas |

Cerrar con los límites del dataset, no con el buscador.

---

## 19. Prioridad si el Tiempo se Reduce

Si hay que recortar, el orden de defensa es:

1. Cumplimiento de ToS con TTL y purga (sección 6)
2. Auditoría de cobertura y sesgo (sección 7)
3. Modelo de amenazas de la whitelist (sección 11)
4. Trazabilidad y telemetría de costo (secciones 3 y 14)

Lo primero en caerse: normalización con LLM (sección 9, opción B), dedup difusa, y refinamiento visual de la UI.
