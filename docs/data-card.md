---
title: "Data Card — Directorio de Médicos Especialistas de Ciudad de Guatemala"
author: "Proyecto académico — Ministerio de Educación de Guatemala (contexto simulado)"
date: "12 de agosto de 2026"
geometry: margin=2.5cm
fontsize: 11pt
---

## 1. Motivación y uso previsto

Este dataset fue construido para un directorio de referencia de médicos especialistas en Ciudad de Guatemala, como proyecto académico del curso de Responsible AI. El Ministerio de Educación de Guatemala es el cliente simulado.

**Uso previsto:** referencia informativa para que una persona ubique médicos especialistas por zona y especialidad.

**Uso explícitamente NO previsto:** este dataset **no valida credenciales médicas ni vigencia de colegiaturas**. No debe usarse para decisiones clínicas, de emergencia, ni como fuente de verificación profesional.

## 2. Composición

**Volumen actual:** 768 médicos activos (no suprimidos), recolectados entre el 12 de agosto de 2026 (mismo día, recolección concentrada).

**Cobertura geográfica:** zona 1 a zona 18 de Ciudad de Guatemala.

**Distribución por especialidad:**

| Especialidad | Registros |
|---|---:|
| Ginecología | 154 |
| Pediatría | 145 |
| Oftalmología | 104 |
| Psiquiatría | 95 |
| Dermatología | 92 |
| Traumatología | 80 |
| Cardiología | 57 |
| Ortopedia | 41 |

**Campos por registro:**

| Campo | Descripción |
|---|---|
| `nombre` | Nombre del negocio/médico según Google Places |
| `especialidad` | Especialidad **efectiva**: derivada del nombre si el patrón coincide, si no la especialidad buscada. Es el campo por el que filtra el directorio. |
| `especialidad_raw` | Especialidad usada en la búsqueda (trazabilidad) |
| `especialidad_normalizada` | Especialidad extraída del nombre por reglas determinísticas, o `null` si no hay coincidencia |
| `confidence` | 0.9 si hubo coincidencia de especialidad, 0 si no |
| `direccion` | Dirección formateada de Google Places |
| `telefono` | Teléfono, o `null` si Google Places no lo reportó |
| `sitio_web` | Sitio web, o `null` si Google Places no lo reportó |
| `zona` | Zona **efectiva**: extraída de la dirección real si contiene el patrón "zona N", si no la zona buscada. Es el campo por el que filtra el directorio. |
| `zona_raw` | Zona usada en la búsqueda (trazabilidad) |
| `zona_normalizada` | Zona extraída de la dirección, o `null` si la dirección no la menciona |
| `place_id` | Identificador persistente de Google Places (único campo retenido indefinidamente) |
| `fecha_recoleccion` | Fecha de la última recolección o refresco |
| `expires_at` | `fecha_recoleccion` + 30 días — ventana de retención según ToS de Google Maps Platform |
| `missing_fields` | Lista explícita de campos ausentes en la fuente — nunca se infiere ni se rellena |
| `suppressed` | `true` si el titular solicitó su remoción — sobrevive a recolecciones futuras |

## 3. Procedimiento de recolección

**Fuente:** Google Places API (Text Search + Place Details).

**Estrategia:** matriz de 576 combinaciones (8 especialidades × 4 sufijos de búsqueda × 18 zonas), documentada en `docs/keyword-strategy.md`. El orden de recolección es ancho-primero: se prioriza tener al menos una búsqueda por cada celda zona × especialidad antes de profundizar con sufijos adicionales, para que la cobertura parcial (limitada por cuota diaria) sea representativa de toda la ciudad y no solo de las primeras zonas buscadas.

**Costo teórico medido** (según tarifa de lista, no cargo facturado): 349 corridas de recolección, 5,821 llamadas a la API, **\$104.19 USD**. Costo separado por tipo de llamada: Text Search (\$0.032/llamada) y Place Details (\$0.017/llamada), con tarifas reales distintas.

**Nota sobre precios (verificada contra documentación oficial de Google):** el enunciado original de este proyecto asume un crédito mensual fijo de \$200 en Places API. Ese crédito se descontinuó el 1 de marzo de 2025; el esquema actual otorga **10,000 llamadas gratis al mes por producto** (nivel Essentials). Las 5,821 llamadas de esta recolección caen completas dentro de esa cuota gratuita — el costo real facturado fue **\$0.00**, confirmado en la consola de facturación de GCP. El monto de \$104.19 sigue siendo el dato relevante para telemetría de FinOps (mide disciplina de gasto, no solo "no se pasó del límite"), pero no representa un cargo real bajo el esquema de precios vigente.

## 4. Preprocesamiento y normalización

**Decisión de diseño:** normalización por reglas determinísticas, sin modelo de lenguaje. Google Places no expone un campo de especialidad médica ni de zona administrativa — ambos se derivan del único texto libre disponible (`nombre` del negocio y `direccion`), usando coincidencia de raíces de palabra (para especialidad) y expresiones regulares (para zona).

Cuando no hay coincidencia, el campo derivado queda en `null` — nunca se asume ni se inventa. El campo "buscado" (`especialidad_raw`, `zona_raw`) siempre se conserva para trazabilidad, incluso cuando el derivado lo reemplaza como valor efectivo.

Se descartó normalización asistida por LLM por costo, tiempo de etiquetado de un set de evaluación, y porque una especialidad alucinada puede derivar en daño real a un paciente — el costo de ese error supera la ganancia de cobertura.

## 5. Limitaciones conocidas

**Cobertura de la auditoría de sesgo:** 122 de 144 celdas posibles (zona × especialidad) tienen al menos un resultado; **22 celdas fueron buscadas y no devolvieron ningún resultado**. Promedio de completitud de contacto sobre las celdas con datos: 87.16% con teléfono, 43.27% con sitio web.

**Hallazgo central:** la ausencia de resultados en una celda no significa ausencia de médicos en esa zona/especialidad — significa que Google Places no tiene ese comercio digitalizado bajo los términos de búsqueda usados. Zonas de menor presencia digital (comercial) aparecen sistemáticamente subrepresentadas frente a zonas con mayor cobertura de negocios en Google Maps. Usar este dataset para asignar recursos de salud o planificar cobertura de servicios médicos amplificaría esa brecha digital existente.

**Resultados fuera de alcance:** la búsqueda por texto de Google Places puede devolver resultados fuera de Ciudad de Guatemala (coincidencia por nombre/tipo de negocio, no por ubicación real) — por ejemplo, clínicas en Escuintla devueltas al buscar por especialidad sin restricción geográfica estricta. Cuando la dirección no contiene un patrón de zona reconocible, `zona_normalizada` queda `null` en vez de asumir la zona buscada como verdadera.

**Ventana temporal:** todo el contenido (excepto `place_id`) tiene una vida máxima de 30 días por los Términos de Servicio de Google Maps Platform. Los datos de este documento reflejan el estado del dataset al 12 de agosto de 2026 y no son una instantánea permanente.

## 6. Usos prohibidos

- Asignación de recursos de salud pública basada en la densidad de resultados por zona.
- Planificación de cobertura de servicios médicos.
- Verificación de credenciales, colegiatura o habilitación profesional.
- Uso en decisiones clínicas o de emergencia.
- Redistribución como producto o dataset independiente — los datos provienen de Google Places API y están sujetos a sus Términos de Servicio; este uso es estrictamente académico.

---

*Documento generado a partir de datos en producción del proyecto.*
