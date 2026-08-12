# Guion de Presentación — Directorio de Médicos Especialistas

20 minutos. No demuestres un CRUD — demuestra el argumento: **construimos un directorio, pero el proyecto real es la auditoría de la fuente de datos que lo alimenta.**

URL de la demo: `https://rai-proyecto1-502801.web.app`

---

## 0. Apertura (1 min)

> "El Ministerio de Educación pidió un directorio de médicos especialistas: recolectar, guardar, exponer. Eso lo cumplimos. Pero en el camino descubrimos tres cosas que un directorio 'que solo funciona' no te dice: que la fuente de datos está sesgada, que hay una cláusula de retención de Google que casi todos ignoran, y que la seguridad que nos pidieron (whitelist de IP) tiene huecos reales que hay que documentar, no esconder."

Números para abrir con fuerza (actualízalos con los reales del día de la demo):
- **576 combinaciones** en la matriz de recolección (8 especialidades × 4 sufijos de búsqueda × 18 zonas)
- **~120+ médicos** ya recolectados en producción real (no datos de prueba)
- **Costo real medido**, no estimado a ojo: Text Search $0.032/llamada, Place Details $0.017/llamada

---

## 1. Qué construimos (1 min, rápido)

Arquitectura en una frase: **Cloud Functions (TypeScript) + Firestore + Google Places API + Firebase Hosting**, con IP whitelist, App Check y rate limiting como capas de seguridad, y un scheduler diario que audita el sesgo de la fuente y cumple los términos de servicio de Google.

Muestra el diagrama de arquitectura (sección 3 de `plan.md`) 5 segundos, no más — el resto de la presentación ES el diagrama explicado en vivo.

---

## 2. Auditamos nuestros propios datos (5 min) — el corazón de la presentación

**Hipótesis:** Google Places no representa Ciudad de Guatemala de forma uniforme. Zonas de mayor poder adquisitivo tienen más presencia digital (más clínicas con página web, más reseñas); zonas de menor ingreso aparecen subrepresentadas — no porque haya menos médicos, sino porque hay menos digitalización.

**Demo en vivo:**
1. Abre la UI → sección "Auditoría de cobertura" → el heatmap zona × especialidad.
2. Señala una celda pálida o vacía: "Esto no significa que no haya médicos aquí. Significa que Google Places no los tiene digitalizados, o que todavía no hemos buscado ahí."
3. Explica cómo se distingue esa diferencia — **esto es un bug real que encontramos y arreglamos**, vale la pena contarlo: al principio, `searches_run` (cuántas veces buscamos en esa celda) se calculaba contando los médicos ya guardados. Una zona donde buscamos 10 veces y Google no devolvió nada se veía **idéntica** a una zona donde nunca buscamos — ambas en cero. Lo corregimos para que cuente desde `collection_runs` (el registro de cada búsqueda, incluidas las que no encontraron nada), así el heatmap sí puede decir "buscamos y no hay" en vez de solo "no hay".

**El hallazgo a declarar en voz alta:**
> "Usar este dataset para asignar recursos de salud o planificar cobertura amplificaría la brecha digital existente — las zonas menos digitalizadas se verían como zonas sin médicos."

Esto es lo que convierte el proyecto de "hicimos un directorio" a "auditamos una fuente de datos", que es el objetivo real del curso.

---

## 3. Encontramos un problema de cumplimiento (3 min)

**El hallazgo:** los Términos de Servicio de Google Maps Platform permiten guardar `place_id` indefinidamente, pero el resto del contenido (nombre, teléfono, dirección) solo se puede cachear **30 días**. Un proyecto académico que guarda datos "para siempre porque es solo una tarea" está en incumplimiento real.

**Demo en vivo:** muestra el código de `purgeExpiredRecords` (o el log de una ejecución) — cada documento vencido se re-consulta por `place_id` (persistente, permitido) y se renueva, o si ya no existe / no hay forma de refrescarlo, se purga y solo sobrevive el `place_id`.

**El detalle que muestra rigor real, no solo una función que "borra cosas":**
> "Un médico que pidió que lo removiéramos (`suppressed: true`) nunca se refresca — lo purgamos directo. Si lo refrescáramos, estaríamos volviendo a descargar y guardar sus datos personales cada 30 días para siempre, exactamente lo que él pidió que no hiciéramos. Este es un bug que encontramos nosotros mismos en revisión de código, no algo que nos señalara alguien más."

---

## 4. Demo de la whitelist — en vivo, con fallos reales (3 min)

No expliques la whitelist en abstracto. Muéstrala fallando y funcionando:

1. `curl` a `/directorio` sin header autorizado → **403**.
2. `curl` con un header `X-Forwarded-For` falsificado (poniendo la IP autorizada como primer valor) → **sigue bloqueado**. Explica por qué: Google agrega la IP real al final de la cadena; todo lo anterior lo controla el cliente y es falsificable. Confiar en la primera posición es el error que casi todos cometen.
3. Abre Firestore Console → colección `access_log` → muestra las entradas 403 quedando registradas.

**La anécdota que vale oro en la demo:** cuenta que este error apareció **dos veces** en el proyecto real — una vez lo encontramos y arreglamos nosotros, y una vez un cambio de un compañero lo reintrodujo sin querer (asumió una topología de red que el proyecto no tiene). Lo volvimos a encontrar probándolo contra producción real, no solo contra el emulador — porque cuando desplegamos, la UI pasa por Firebase Hosting como proxy, agregando un salto extra a la cadena de IPs que el emulador no simula. Esto es la diferencia entre "declarar que funciona" y "demostrar que funciona con evidencia real".

---

## 5. Por qué la whitelist no basta (3 min)

Muestra la tabla de limitaciones documentadas (`plan.md` sección 11) y explica **dos o tres**, no las siete — elige las que mejor cuentes:

- No hay autenticación real, solo ubicación de red — cualquiera dentro de esa IP tiene acceso.
- IPs dinámicas rompen el acceso — le pasó literalmente a Diego durante el despliegue (su ISP le cambió la IP a medio proyecto).
- No protege contra abuso desde una IP ya autorizada — por eso además hay rate limiting.

**Defensa en profundidad:** App Check (token de reCAPTCHA v3 verificado en cada request), rate limiting transaccional en Firestore para `/correcciones` (el único endpoint público, sin whitelist a propósito — tiene que poder llamarlo cualquier médico que quiera pedir su remoción).

---

## 6. Derechos de los titulares de datos + Data Card (2 min)

Los médicos en el directorio **no dieron consentimiento** — su info es pública en Google Maps, que no es lo mismo que consentimiento para redistribución.

**Demo en vivo:** formulario de corrección/remoción en la UI. Explica la asimetría de diseño (esto demuestra criterio, no solo funcionalidad):
- **Remoción → automática e inmediata.** Prioriza al titular del dato sobre la completitud del directorio.
- **Corrección de datos → queda pendiente de revisión humana.** Publicar un teléfono o dirección falsos sin verificar puede dañar a un paciente.

Menciona la Data Card (si ya está armada) — documento que declara: motivación, composición del dataset, procedimiento de recolección, limitaciones conocidas, **usos prohibidos**.

---

## 7. Para qué NO debe usarse este dataset (2 min)

Cierra con límites, no con el buscador. Esto es lo que un jurado recuerda:

> "Este directorio es una referencia informativa. No valida credenciales médicas ni vigencia de colegiaturas. No debe usarse para decisiones clínicas, de emergencia, ni para asignar recursos de salud — porque, como mostramos en el heatmap, la ausencia de datos en una zona no significa ausencia de médicos."

---

## 8. Cierre y preguntas (1 min)

> "Empezamos con un enunciado que pedía un directorio con seguridad básica. Terminamos con un sistema que audita su propia fuente de datos, respeta los derechos de quien aparece en él, y documenta honestamente dónde falla — en vez de fingir que no falla."

---

## Preguntas esperadas y respuestas cortas

**"¿Por qué no usaron un modelo/LLM para normalizar especialidades?"**
Lo evaluamos (plan.md sección 9) y decidimos reglas determinísticas: sin modelo, sin alucinación posible, auditable. Un LLM hubiera necesitado un set de evaluación etiquetado a mano y presupuesto de inferencia que no se justificaba para el alcance de 4 semanas — y una especialidad médica alucinada puede derivar en daño real.

**"¿Qué tan seguro es esto en producción de verdad, no solo en el enunciado?"**
Lo desplegamos a un proyecto GCP real y encontramos (y arreglamos) bugs que solo aparecen ahí: la topología real de Firebase Hosting agregando un salto a la cadena de IPs, una API key restringida por IP incompatible con llamadas server-to-server desde Cloud Functions, cuotas diarias frenando la recolección exactamente como se diseñó. Todo documentado en `docs/deploy-troubleshooting.md`.

**"¿Cuánto costó esto realmente?"**
Telemetría por corrida en `collection_runs`: costo separado por tipo de llamada (Text Search vs Place Details, que tienen tarifas distintas), no un número inventado. Dentro del crédito de $200/mes de Places API, con cuota diaria como límite duro.

**"¿Qué pasa si alguien abusa del endpoint de correcciones, que es público?"**
Rate limiting transaccional en Firestore — 5 requests por minuto por IP, corregido para que sea consistente incluso si Cloud Functions escala a múltiples instancias (un rate limiter en memoria no sirve ahí, y lo documentamos explícitamente).

**"¿Cómo saben que el heatmap mide sesgo real y no solo su propia estrategia de búsqueda?"**
Por eso la cobertura balanceada es una regla, no una sugerencia: el mismo número de combinaciones especialidad × sufijo se ejecuta en cada zona, sin importar cuántos resultados devuelva. Si concentráramos esfuerzo donde "sí hay resultados", estaríamos midiendo nuestro propio criterio de búsqueda, no la realidad de la fuente.

---

## Notas para el presentador

- No narres el código línea por línea. Cuenta el argumento, muestra la evidencia (curl, Firestore Console, la UI) en 10-15 segundos por punto.
- Los "bugs que encontramos y arreglamos nosotros mismos" son tu mejor material — demuestran que hubo revisión real, no solo que "funcionó a la primera". Úsalos.
- Si algo falla en vivo durante la demo (quota agotada, un endpoint lento): decilo en voz alta y sigue. "Esto es justo la cuota diaria de $200 protegiendo el presupuesto — funcionando" es mejor material de presentación que fingir que no pasó nada.
