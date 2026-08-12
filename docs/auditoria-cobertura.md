# Informe de Auditoría de Cobertura y Sesgo

**Objeto de la auditoría:** Google Places API como fuente de datos de oferta médica en
Ciudad de Guatemala.
**Datos:** `docs/auditoria-cobertura-datos.md` (generado, no editar a mano).
**Estado:** recolección en producción completada el 12 de agosto de 2026. Agregados de cobertura
disponibles; el desglose por celda requiere regenerar el informe contra producción — ver §6.

---

## 1. Por qué auditamos nuestra propia fuente

El encargo pedía construir un directorio. Construirlo sin medirlo habría producido un artefacto
con una propiedad peligrosa: **parece un censo de médicos y no lo es.** Es un censo de médicos
*con presencia digital en Google Maps*, que es otra cosa.

La diferencia importa porque el cliente es el Ministerio de Educación. Un directorio que se lee
como mapa de oferta médica puede terminar informando decisiones de asignación de recursos. Si
las zonas menos digitalizadas aparecen vacías, esas decisiones las tratarían como zonas sin
médicos.

Esta auditoría existe para que ese error no se pueda cometer por accidente.

---

## 2. Hipótesis

> Google Places no representa Ciudad de Guatemala de forma uniforme. Las zonas con presencia
> digital consolidada aparecen sobrerrepresentadas; las zonas con menor digitalización aparecen
> subrepresentadas — no porque haya menos médicos, sino porque hay menos negocios registrados
> en Google.

---

## 3. Método

Se calcula, por celda zona × especialidad:

| Métrica | Definición | Fuente |
|---|---|---|
| `searches_run` | Invocaciones ejecutadas, **incluidas las de cero resultados** | `collection_runs` |
| `unique_results` | Registros únicos vigentes, excluidos los `suppressed` | `medicos` |
| `pct_con_telefono` | % de esos registros con teléfono | `medicos` |
| `pct_con_sitio_web` | % de esos registros con sitio web | `medicos` |
| Rendimiento | `unique_results / searches_run` | derivado |

Tres decisiones de método sostienen la validez del resultado:

**1. `searches_run` se cuenta desde `collection_runs`, no desde `medicos`.** Si se contara desde
los resultados, una zona buscada diez veces sin encontrar nada y una zona nunca buscada se
verían idénticas: cero registros. Esa distinción es justamente lo que la auditoría existe para
capturar, así que en las tablas `—` significa "no buscada todavía" y `0` significa "buscada, sin
resultados". El `0` es un dato.

**2. Cobertura balanceada obligatoria.** Se ejecuta el mismo número de búsquedas en cada zona,
sin importar el rendimiento. Si hubiéramos concentrado el esfuerzo donde aparecían resultados,
la matriz mediría nuestro criterio de búsqueda en lugar de la fuente, y el hallazgo sería
circular. Esta restricción cuesta llamadas de API en zonas improductivas y es deliberada.

**3. Los registros con remoción solicitada se excluyen de los agregados,** no solo del
directorio público. Una persona que pidió salir no debería seguir contando en nuestras
estadísticas.

**4. Las celdas se agrupan por la zona y especialidad BUSCADAS, no por las efectivas.** El
directorio filtra por los campos efectivos —zona extraída de la dirección, especialidad derivada
del nombre— pero la matriz de cobertura no puede usarlos. `searches_run` sale de
`collection_runs`, cuyo espacio de claves es el de los términos consultados; agrupar los
resultados por el campo efectivo mientras las búsquedas se cuentan por el buscado produciría
celdas que acumulan resultados que ninguna de sus búsquedas generó, y el rendimiento
`unique_results / searches_run` dejaría de significar nada. La auditoría mide **qué devolvió la
fuente cuando le preguntamos X**, así que la unidad de análisis tiene que ser la pregunta, no la
respuesta.

**Costo adicional de API: ≈ 0.** La auditoría se calcula sobre datos ya recolectados.

---

## 4. Cómo regenerar los datos

```bash
# Contra el emulador
npm --prefix functions run build
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  node functions/scripts/coverage-report.js --project demo-test

# Contra producción (credenciales de servicio con acceso de lectura a Firestore)
GOOGLE_APPLICATION_CREDENTIALS=key.json \
  node functions/scripts/coverage-report.js --project <project-id>
```

Escribe `docs/auditoria-cobertura-datos.md`. El script recalcula `coverage_stats` por la misma
ruta de código que usan la función programada y el heatmap de la UI, de modo que el informe, el
endpoint `/coverage` y la pantalla no puedan divergir.

El heatmap equivalente está en la UI desplegada, bajo "Auditoría de cobertura", con un selector
para alternar la métrica coloreada entre resultados encontrados y % con teléfono.

---

## 5. Hallazgo

### Cifras medidas

Recolección del 12 de agosto de 2026 sobre la grilla completa de 18 zonas × 8 especialidades:

| Métrica | Valor |
|---|---|
| Registros únicos vigentes | 768 |
| Celdas de la grilla | 144 |
| Celdas con al menos un resultado | 122 |
| **Celdas buscadas que no devolvieron nada** | **22 (15.3 %)** |
| Completitud de teléfono (celdas con datos) | 87.16 % |
| Completitud de sitio web (celdas con datos) | 43.27 % |
| Rendimiento máx. vs mín. por zona | ‹pendiente — requiere `auditoria-cobertura-datos.md` regenerado contra producción› |

Las 22 celdas vacías son el dato central del informe, y su valor depende enteramente de la
decisión de método #1: fueron **buscadas**, con el mismo esfuerzo que las demás, y la fuente no
devolvió nada. Sin `searches_run` contado desde `collection_runs`, serían indistinguibles de
celdas que nunca se consultaron.

### Interpretación

> El directorio construido a partir de Google Places no cubre Ciudad de Guatemala de forma
> uniforme. Con el mismo número de búsquedas ejecutadas en cada celda de la grilla, el 15.3 % de
> ellas no devolvió ningún resultado, y la completitud de contacto de lo que sí devolvió es
> desigual: casi 9 de cada 10 registros traen teléfono, pero menos de la mitad traen sitio web.
> Usar este dataset para asignar recursos de salud, planificar cobertura o evaluar oferta médica
> amplificaría la brecha digital existente: las celdas sin resultados aparecerían como zonas sin
> médicos, cuando lo único medido es que Google no las tiene registradas bajo nuestros términos
> de búsqueda.

> **Pendiente de cerrar:** la afirmación más fuerte de la hipótesis —que las zonas más
> productivas rinden N× más que las menos productivas— **todavía no está respaldada con el
> número**, porque exige el desglose por zona que produce el script generador (§4) y ese aún no
> se corrió contra producción. La conclusión de arriba se limita a lo que los agregados actuales
> sostienen. Un informe de sesgo que reporta el sesgo que esperaba encontrar, con o sin datos que
> lo sostengan, no es una auditoría.

### Qué mide y qué no mide este hallazgo

Un límite que el informe debe declarar sobre sí mismo: **medimos rendimiento de búsqueda por
zona, no nivel de ingreso.** No tenemos datos socioeconómicos por zona, y no los recolectamos.

Vincular el bajo rendimiento con menor poder adquisitivo es una **interpretación plausible, no
un resultado medido**. Lo que los datos sostienen directamente es más estrecho y ya es
suficiente para el argumento: *la fuente rinde de forma muy desigual entre zonas, con esfuerzo
de búsqueda idéntico*. Que la causa sea digitalización, densidad comercial, patrones de
nomenclatura o una combinación, esta auditoría no lo distingue.

Otras explicaciones que no podemos descartar con estos datos:

- Que los consultorios de ciertas zonas se registren en Maps bajo categorías o nombres que
  nuestras keywords no capturan (sesgo de nuestro instrumento, no de la fuente).
- Que la densidad de consultorios sea genuinamente desigual entre zonas.
- Que el tope de 20 resultados por invocación trunque las zonas más densas, comprimiendo la
  brecha medida — lo cual haría que la desigualdad real sea **mayor** que la reportada.

---

## 6. Estado

| Requisito | Estado |
|---|---|
| Cálculo de la matriz (`computeCoverageStats`) | ✅ implementado y probado |
| Endpoint `/coverage` | ✅ operativo |
| Heatmap en la UI | ✅ operativo, con alternancia entre resultados y % con teléfono |
| Script generador del informe | ✅ verificado contra el emulador |
| Recolección en producción | ✅ completada — 349 corridas, 5,821 llamadas, 768 registros |
| **Informe por celda regenerado contra producción** | ❌ pendiente — cierra el número que falta en §5 |

Lo único que resta es correr el script generador (§4) contra el proyecto de producción con
credenciales de servicio. No consume Places API: recalcula sobre datos ya almacenados.

`runCollectionBatch` avanza un cursor compartido, así que los cuatro integrantes pueden
recolectar en paralelo desde sus propios proyectos sin repetir combinaciones. El recorrido
ancho-primero está implementado en `buildKeywordMatrix()`: la matriz se ordena sufijo → zona →
especialidad, de modo que los primeros 144 combos cubren cada celda de la grilla una vez antes de
repetir ninguna con un segundo sufijo. Agotar zona por zona habría dejado el heatmap parcial
mostrando la mayoría de las celdas como "nunca buscadas" durante días, y una matriz parcial que
no es representativa no es interpretable — que es exactamente lo que esta auditoría necesita
evitar. Cambiar ese orden invalidó el cursor existente, por eso existe `/resetCollectionProgress`.

---

## 7. Consecuencias para el uso del dataset

Este hallazgo es la razón del uso prohibido #1 de la Data Card. Se traduce en tres reglas:

1. **La ausencia no es evidencia de ausencia.** Una celda vacía significa "Google no lo tiene",
   nunca "ahí no hay médicos".
2. **Los conteos por zona no son comparables entre sí** como medida de oferta médica.
3. **Los porcentajes de teléfono y sitio web miden digitalización**, no calidad ni
   accesibilidad de la atención.
