# Estrategia de Keywords

Fuente de verdad en código: [`functions/src/config/keywordStrategy.ts`](../functions/src/config/keywordStrategy.ts).

## Especialidades objetivo

Cardiología, pediatría, dermatología, ginecología, ortopedia, oftalmología, traumatología, psiquiatría.

## Zonas

Zona 1 a zona 18 de Ciudad de Guatemala.

## Sufijos de búsqueda

`médico`, `doctor`, `clínica`, `consultorio` — Google Maps no tiene nomenclatura consistente para consultorios médicos, así que cada especialidad se busca con los cuatro sufijos.

## Patrón de keyword

```
"<sufijo> <especialidad> <zona> Guatemala"
```

Ejemplos: `"clínica cardiología zona 10 Guatemala"`, `"doctor pediatría zona 1 Guatemala"`.

## Regla de cobertura balanceada

El mismo número de combinaciones (especialidad × sufijo) se ejecuta en cada zona, sin importar cuántos resultados devuelva. Concentrar el esfuerzo solo donde "sí hay resultados" sesgaría la auditoría de cobertura de la sección 7 del plan — mediríamos nuestro propio criterio de búsqueda, no la realidad de la fuente.

## Volumen total y orden de recolección

8 especialidades × 4 sufijos × 18 zonas = **576 combinaciones**. A la cuota diaria de la API, cubrir todo toma varios días — el **orden** de la matriz importa para que la cobertura parcial sea representativa.

`buildKeywordMatrix()` recorre **sufijo → zona → especialidad**, no zona → especialidad → sufijo. Los primeros 144 combos (las 8 especialidades × 18 zonas con el sufijo `médico`) ya tocan **cada celda** de la grilla zona × especialidad al menos una vez, antes de repetir ninguna celda con un segundo sufijo. Con el orden anterior (zona por zona, agotando cada una antes de pasar a la siguiente), la cobertura parcial dejaba la mayoría del heatmap mostrando "nunca buscado" durante mucho tiempo, aunque sí se hubiera buscado — solo que concentrado en las primeras zonas. Este orden hace que el progreso parcial sea representativo de toda la grilla, no solo de las primeras filas.

## Trazabilidad

Cada documento en `medicos` guarda `keyword_usado` y `run_id`. Cada invocación crea un documento en `collection_runs` con el keyword, la zona, resultados nuevos vs. duplicados y el costo estimado — así se puede auditar qué combinaciones ya se corrieron y evitar repetirlas.

## Cómo correr la matriz completa

`GET /runCollectionBatch?batchSize=N` (mismo IP whitelist que `/recolectarMedicos`) recorre `buildKeywordMatrix()` en orden, avanzando un cursor persistido en `collection_progress/state`. Cada llamada procesa las siguientes `N` combinaciones (default 2, máx. 10) y guarda por dónde se quedó, así que cualquier integrante del equipo puede seguir donde otro dejó sin repetir búsquedas ni saltarse zonas. `recolectarMedicos` (`keyword`, `zona`, `especialidad` manuales) sigue disponible para búsquedas puntuales fuera de la matriz.
