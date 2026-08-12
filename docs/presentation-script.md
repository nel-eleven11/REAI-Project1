# Guion de Presentación — Directorio de Médicos Especialistas

20 minutos. No demuestres un CRUD — demuestra el argumento: **construimos un directorio, pero el proyecto real es la auditoría de la fuente de datos que lo alimenta.**

**URL de la demo:** `https://rai-proyecto1-502801.web.app`
**Datos reales al momento de escribir esto** (actualiza si vuelves a correr recolección antes de presentar): 768 médicos activos, 122/144 celdas del heatmap con al menos un resultado, \$104.19 USD gastados de los \$200 de crédito, 349 corridas de recolección, 5,821 llamadas a la API.

---

## 0. Apertura (1 min)

**Qué decir:**

> "El Ministerio de Educación pidió un directorio de médicos especialistas: recolectar, guardar, exponer, con seguridad básica. Eso lo cumplimos. Pero en el camino nos topamos con bugs reales — no hipotéticos, bugs que encontramos probando contra producción de verdad — que nos obligaron a decidir entre 'que funcione' y 'que sea honesto sobre lo que sabe y lo que no sabe'. Elegimos lo segundo, y eso es lo que les vamos a mostrar."

**Números para abrir con fuerza** (dilos de memoria, no los leas de una diapositiva):

- 768 médicos, 8 especialidades, cobertura real en las 18 zonas de la ciudad
- 576 combinaciones en la matriz de recolección balanceada
- Costo medido con precisión real: \$104.19 de \$200, con tarifas distintas por tipo de llamada

---

## 1. Qué construimos (1 min, rápido)

**Qué decir:**

> "Cloud Functions en TypeScript, Firestore, Google Places API, Firebase Hosting. Tres capas de seguridad — whitelist de IP, App Check, rate limiting — y dos procesos programados: uno que audita el sesgo de la fuente, otro que cumple los términos de servicio de Google purgando datos vencidos."

Muestra el diagrama de arquitectura (sección 3 de `plan.md`) 5 segundos, no más. El resto de la presentación ES el diagrama explicado en vivo, con evidencia.

---

## 2. Auditamos nuestros propios datos (5 min) — el corazón de la presentación

**Hipótesis a decir en voz alta:**

> "Google Places no representa Ciudad de Guatemala de forma uniforme. No porque Google sea malintencionado, sino porque el mapa que tiene refleja quién se ha digitalizado, no quién existe."

**Demo en vivo — abre la UI, sección de heatmap:**

1. Señala el botón de toggle. Explica por qué existe:

   > "Este heatmap tiene dos vistas, y la diferencia entre ellas es un hallazgo real que tuvimos en revisión de código. 'Resultados encontrados' mide cuántos médicos devolvió la búsqueda — eso es cobertura real. '% con teléfono' mide, de los que sí encontramos, cuántos tienen un dato de contacto completo. Al principio solo teníamos la segunda vista, y una celda con cero resultados se veía **idéntica** a una celda con resultados pero sin teléfono — ambas en blanco. Eso mezclaba dos cosas completamente distintas: 'la fuente no tiene nada aquí' contra 'la fuente tiene algo pero incompleto'. Las separamos."

2. Cambia a "Resultados encontrados". Señala una celda pálida o en cero — usa una real, verificada: **zona 10 / dermatología**, **zona 16 / ortopedia**, o **zona 17 / cardiología** (las tres tienen 0 resultados confirmados, no es un cálculo aproximado).

   > "Esta celda no significa que no haya dermatólogos en zona 10. Significa que buscamos y Google Places no nos devolvió ninguno bajo ese término de búsqueda."

3. Si el tiempo lo permite, señala el patrón por especialidad, no solo por zona:

   > "Miren ortopedia en particular — es la especialidad con más celdas en cero en toda la grilla, en varias zonas distintas. Eso no es una zona 'mala', es que la fuente completa está peor digitalizada para esa especialidad específica. Es un hallazgo más preciso que 'esta zona no tiene datos'."

**El hallazgo a declarar en voz alta, cerrando la sección:**

> "Usar este dataset para asignar recursos de salud o planificar cobertura amplificaría la brecha digital existente — las zonas y especialidades menos digitalizadas se verían como zonas sin médicos."

---

## 3. Encontramos un problema de cumplimiento (3 min)

**El hallazgo:**

> "Los Términos de Servicio de Google Maps Platform permiten guardar `place_id` para siempre, pero el resto del contenido — nombre, teléfono, dirección — solo se puede cachear 30 días. Un proyecto académico que guarda datos 'para siempre porque es solo una tarea' está, técnicamente, en incumplimiento real."

**Demo en vivo (si tienen acceso a Firestore Console abierto):** muestra un documento purgado — busca uno con `purge_reason` en vez de `nombre`.

> "Cuando un documento vence, no lo borramos a ciegas: primero intentamos refrescarlo re-consultando por `place_id` — que sí se puede retener indefinidamente. Si no se puede refrescar, purgamos el contenido y guardamos por qué: `purge_reason` puede ser 'ya no existe en Places', 'no teníamos la API key configurada', o 'el médico pidió ser removido'. Esa distinción importa — no es lo mismo un error de configuración nuestro que una confirmación real de Google."

**La anécdota que vale oro:**

> "Un médico que pidió su remoción nunca se refresca — se purga directo, sin intentar re-descargar sus datos. Si lo refrescáramos, estaríamos volviendo a guardar su información personal cada 30 días, exactamente lo que pidió que no hiciéramos. Este bug lo encontramos nosotros mismos revisando el código, antes de que nadie más lo notara."

---

## 4. Demo de la whitelist — en vivo, con la topología real (4 min)

**Contexto que hay que decir primero, porque cambia el resto de la demo:**

> "La whitelist de IP no protege un solo salto de red — protege dos. Nuestra UI llama a `/directorio` a través de Firebase Hosting, que actúa como proxy: agrega la IP real del visitante, y luego Cloud Functions agrega encima la IP propia de Hosting. Confiar en la posición equivocada de esa cadena — la primera, o incluso la última — deja pasar ataques o bloquea gente real. Lo confirmamos contra producción real, no en teoría: la primera vez que probamos esto en vivo, la whitelist nos bloqueaba a nosotros mismos mientras un spoof sí pasaba."

**Comando 1 — intento de spoofing (correr desde cualquier máquina, funciona igual):**

```bash
curl -s -i "https://rai-proyecto1-502801.web.app/directorio" \
  -H "X-Forwarded-For: 190.56.194.12"
```

> "Estoy mandando, a mano, la IP que sé que está autorizada, esperando que el sistema me crea. No funciona — el sistema ignora lo que yo le diga al principio de la cadena y usa la posición que Google mismo controla, no la que yo controlo."

**Resultado esperado:** `401 {"error":"Missing App Check token"}` si corres esto desde una red ya autorizada (verás que el sistema te identificó correctamente a TI, no al spoof — pasaste la whitelist como tú mismo, no como el spoof). Si corres esto desde una red **no** autorizada, verás `403 {"error":"Forbidden"}` — el spoof tampoco te deja entrar.

**Comando 2 — la petición honesta, sin trucos:**

```bash
curl -s -i "https://rai-proyecto1-502801.web.app/directorio"
```

> "Sin ningún header falso. El resultado depende exclusivamente de si la red desde la que corro esto está en la whitelist — no de nada que yo pueda escribir."

**El truco para el 403 en vivo, honesto:** ninguno de los dos comandos anteriores da 403 si los corres desde tu propia laptop, porque tu red ya está autorizada — y falsificar el header no cambia eso (esa es justo la prueba de que funciona). Para mostrar el bloqueo real en vivo:

- Pide a alguien del público que corra el segundo comando desde su celular (datos móviles, no el wifi del salón).
- O tú mismo, desde datos móviles en un segundo dispositivo.

> "Le voy a pedir a alguien que corra este mismo comando desde su celular, con datos móviles, ahora mismo."

Eso es más convincente que cualquier cosa preparada — es evidencia en vivo, no una captura de pantalla.

**Si Firestore Console está a mano:** abre la colección `access_log` y muestra las entradas quedando registradas — tanto los 403 como los 401, con IP, ruta y resultado.

---

## 5. Por qué la whitelist no basta (2 min)

Elige 2-3 de estas, no las siete de `plan.md` sección 11:

> "La whitelist es ubicación de red, no identidad — cualquiera dentro de esa IP tiene acceso, no solo la persona autorizada. Las IPs dinámicas rompen el acceso — me pasó literalmente a mí, dos veces, durante el despliegue de este proyecto, mi propio ISP me cambió la IP a media sesión. Y la whitelist sola no protege contra abuso desde una IP ya autorizada — por eso `/correcciones`, que es pública a propósito, tiene rate limiting transaccional en Firestore en vez de whitelist."

> "Por eso agregamos App Check como segunda capa independiente — un token de reCAPTCHA v3 verificado en cada request, no solo 'la red correcta'."

---

## 6. Derechos de los titulares de datos (2 min)

**Demo en vivo:** en la tabla de resultados, haz clic en "Corregir/remover" de cualquier fila.

> "No le pedimos a nadie que sepa un `place_id` de memoria — se busca a sí mismo en la tabla y hace clic. El campo se llena solo."

**La asimetría de diseño, dicha en voz alta porque es la parte que demuestra criterio:**

> "Si pides que te remuevan, se aplica al instante — priorizamos al titular del dato sobre la completitud del directorio. Si pides corregir un dato, queda pendiente de revisión humana — publicar un teléfono o dirección falsos sin verificar puede dañar a un paciente real. No es la misma respuesta para los dos casos, y esa diferencia es intencional."

---

## 7. Para qué NO debe usarse este dataset (2 min)

Cierra con límites, no con el buscador.

> "Este directorio es una referencia informativa. No valida credenciales médicas ni vigencia de colegiaturas. No debe usarse para decisiones clínicas, de emergencia, ni para asignar recursos de salud — porque, como mostramos hace un momento, la ausencia de datos en una celda no significa ausencia de médicos, significa ausencia de digitalización."

---

## 8. Cierre y preguntas (1 min)

> "Empezamos con un enunciado que pedía un directorio con seguridad básica. Terminamos con un sistema que audita su propia fuente de datos, respeta los derechos de quien aparece en ella, y documenta honestamente dónde falla — en vez de fingir que no falla."

---

## Preguntas esperadas y respuestas cortas

**"¿Por qué no usaron un modelo/LLM para normalizar especialidades?"**
Reglas determinísticas, documentado en `plan.md` sección 9: sin modelo, sin alucinación posible, auditable. Un LLM necesita un set de evaluación etiquetado a mano y presupuesto de inferencia que no se justificaba para 4 semanas — y una especialidad médica alucinada puede derivar en daño real.

**"¿La whitelist realmente sirve entonces, si la pueden bypassear?"**
No la pueden bypassear — probamos exactamente eso en vivo. Lo que sí es cierto es que solo protege ubicación de red, no identidad, y lo documentamos como limitación honesta en vez de venderla como solución completa. Por eso hay dos capas más (App Check, rate limiting).

**"¿Qué tan seguro es esto en producción real, no solo en el enunciado?"**
Lo desplegamos a un proyecto GCP real y encontramos — y arreglamos — bugs que solo aparecen ahí: la topología real de Firebase Hosting agregando un salto a la cadena de IPs, una API key restringida por IP incompatible con llamadas server-to-server, un campo de zona que nunca se verificaba contra la dirección real. Documentado en `docs/deploy-troubleshooting.md`.

**"¿Cuánto costó esto realmente?"**
\$104.19 de \$200, medido con tarifas reales separadas por tipo de llamada — no un número inventado. `collection_runs` guarda el costo de cada corrida individual.

**"¿Cómo saben que el heatmap mide sesgo real y no solo su propia estrategia de búsqueda?"**
Cobertura balanceada obligatoria: el mismo número de combinaciones por zona, sin importar el rendimiento. Concentrar esfuerzo donde "sí hay resultados" mediría nuestro propio criterio, no la fuente. Además, el orden de recolección es ancho-primero — cubre toda la grilla al menos una vez antes de profundizar en ninguna zona, para que la cobertura parcial sea representativa.

**"¿Qué pasa si alguien encuentra un dato incorrecto sobre sí mismo que ustedes no puedan verificar?"**
El endpoint de correcciones existe exactamente para eso — y la remoción se aplica de inmediato sin necesidad de que nosotros verifiquemos nada primero, porque el costo de sobre-remover es bajo comparado con ignorar a alguien que no consintió aparecer.

---

## Notas para el presentador

- No narres el código línea por línea. Cuenta el argumento, muestra la evidencia (curl, Firestore Console, la UI) en 10-15 segundos por punto.
- Los bugs reales que encontraron y arreglaron ustedes mismos son el mejor material que tienen — demuestran revisión real, no solo que "funcionó a la primera". Están marcados en este guion como "la anécdota que vale oro" — úsalos, no los recortes por tiempo.
- El truco del 403 en vivo (pedirle a alguien del público que corra el curl desde su celular) es más convincente que cualquier captura preparada. Practícalo antes para saber exactamente qué decir mientras esperas su respuesta.
- Si algo falla en vivo durante la demo (quota agotada, un endpoint lento): decilo en voz alta y sigue. "Esto es justo la cuota diaria protegiendo el presupuesto — funcionando" es mejor material de presentación que fingir que no pasó nada.
- Ten `docs/data-card.pdf` y `plan.md` abiertos en pestañas por si alguien pregunta un número que no memorizaste.
