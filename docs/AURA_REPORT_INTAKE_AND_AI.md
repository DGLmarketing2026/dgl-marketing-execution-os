# AURA: recepción automática de reportes de Marketing y propuesta de IA

Estado al 2026-10-09. Rama `feat/aura-report-intake-info` (sin merge ni despliegue).
Este repositorio es público: aquí no hay datos de clientes, tokens ni direcciones personales.

## 1. Flujo Gmail → Excel → AURA → Campañas: qué existe y qué funciona

Leyenda:
- **Producción verificada:** funcionó con datos reales.
- **Producción sin verificar:** está desplegado, pero no lo comprobé en esta sesión.
- **Solo en esta rama:** probado únicamente con datos sintéticos.

| Etapa | Estado | Evidencia |
|---|---|---|
| Leer la bandeja de Marketing y abrir solo correos de remitentes de la lista (`AURA_GMAIL_ALLOWED_SENDERS`) | **Producción verificada** | Reportes del 10 y 14-sep-2026 procesados; de ahí salió Campaña A. |
| Convertir el XLSX (Drive) y leer las pestañas reconocidas, saltando título y resumen | **Producción verificada** | Mismos reportes; la pestaña "Campana A - HA prioritaria" alimentó Campaña A. |
| Normalizar a `MKT_AURA_GMAIL_OPPORTUNITIES` sin duplicar cuentas (familia + cuenta) | **Producción verificada** | Escritura en lote desde el incidente del 16-sep. |
| Integrar en `MKT_OPPORTUNITIES` (`v6RefreshOpportunitiesFromReports_`) | **Producción verificada** | En uso por AURA y Campaign Studio. |
| Ejecución automática cada hora de la ingesta | **Producción sin verificar** | Corre dentro del latido horario de Adquisición (`v6AcqAutomationTick_`). No confirmé que ese trigger esté instalado hoy. |
| La bandeja es siempre la de Marketing (`AURA_REPORT_INBOX_`, la cuenta info@ de la empresa) y AURA debe correr con esa cuenta | **Solo en esta rama** | Si corre con otra cuenta, devuelve `INBOX_NOT_CONNECTED`. |
| Detectar el reporte por su contenido y no por un solo remitente | **Solo en esta rama** | Acepta cualquier remitente del dominio interno si Gmail autentica el correo (DMARC/DKIM/SPF). Nunca abre correos externos, sin autenticar o de dominios parecidos. |
| Evitar duplicados por archivo (SHA-256) y no tocar el Data Hub en horas sin correo nuevo | **Solo en esta rama** | Estado `DUPLICATE_REPORT` y caché `AURA_REPORT_SEEN_IDS`. |
| Ignorar Excel internos que no son reportes de Marketing | **Solo en esta rama** | Estado `NOT_A_MARKETING_REPORT`, sin etiqueta en Gmail. |
| Trigger propio de recepción (`auraReportIntakeTick`) y activación (`AURA_REPORT_INTAKE_ACTIVATE`) | **Solo en esta rama** | No está instalado. |
| Agente AURA: una tarea automática de análisis por reporte | **Solo en esta rama** | Acción `ANALYZE_MARKETING_REPORT`; entrega solo conteos. |
| Agente AURA: preparar planes de campaña por familia (audiencia, idioma, diseño, exclusiones) | **Producción verificada (modo sombra)** | Ciclo horario activo; las tareas esperan aprobación en AURA. |
| Recalcular un plan pendiente cuando llega un reporte más nuevo | **Solo en esta rama** | El plan registra `sourceReportId`. |
| Aprobación humana (una por campaña) | **Producción verificada** | `AURA_AGENT_APPROVALS`. La ejecución externa del agente sigue deshabilitada (`EXTERNAL_EXECUTION_DISABLED_PHASE_V1`). |
| Envío | **Producción verificada (flujo manual gobernado)** | Campaign Studio → DRY_RUN → GO LIVE. Campaña A: 214 enviados. El agente no envía. |
| Tracking OPEN/CLICK | **Producción verificada** | QA del 7-oct-2026. |
| Respuestas y rebotes | **Parcial** | La ingesta DSN existe, pero aún no hay evidencia real atribuida. |
| Idioma ES/EN/PT por contacto | **Parcial** | En producción solo se resolvió por el dominio del email: 0 contactos EN y muchos `UNRESOLVED`, que quedan excluidos (falla cerrado). |
| Exportación CSV | **Producción verificada** | Mismo resultado en la plataforma actual y en Growth OS. |

## 2. Qué falta para activar la recepción automática desde la bandeja de Marketing

Cada paso requiere tu autorización explícita.

1. **Revisar y hacer merge** de este PR. Hoy `main` no cambia.
2. **Desplegar el backend** en Apps Script (clasp push + nueva versión del deployment existente).
3. **Confirmar la cuenta de ejecución:** el proyecto debe correr con la cuenta de la bandeja de Marketing (`AURA_REPORT_INBOX_`). `Session.getEffectiveUser()` puede pedir una nueva autorización (permiso de email del usuario). Si al desplegar aparece la pantalla de permisos, debe aceptarla esa misma cuenta.
4. **Propiedades del script:**
   - `AURA_GMAIL_ALLOWED_SENDERS`: se mantiene (la lista actual sigue funcionando).
   - `AURA_GMAIL_TRUSTED_DOMAINS`: opcional; por defecto es el dominio de la bandeja. Con `NONE` se aceptan solo remitentes de la lista.
5. **Ejecutar una vez `AURA_REPORT_INTAKE_ACTIVATE()`** desde el editor. Instala un trigger horario y hace una primera lectura. No envía correos.
6. **Validar con el próximo reporte real:**
   - Que Gmail autentique los correos internos. Si un remitente interno queda en `untrustedSkipped`, se agrega a la lista de remitentes.
   - Que las pestañas del Excel coincidan con las conocidas. Si cambian, hay que agregar el nombre al mapa `MKT_V6_AURA_GMAIL_SHEET_FAMILY`.
   - Que aparezca la tarea "Marketing report received" en AURA y que los planes queden esperando aprobación.
7. **Opcional:** decidir si se mantiene la ingesta dentro del latido de Adquisición. Hay un candado que evita que ambas corran al mismo tiempo.

## 3. Reglas tradicionales vs. modelo de IA

Hoy todo AURA funciona con reglas deterministas. Ninguna llamada a un modelo de IA está conectada.

| Capacidad | Hoy | ¿Requiere IA? |
|---|---|---|
| Detectar el reporte, verificar el remitente, evitar duplicados | Reglas | No |
| Leer el XLSX y mapear pestañas a familias | Reglas (nombres exactos de pestaña) | No. La IA podría *sugerir* el mapeo de una pestaña nueva, siempre con aprobación humana. |
| Elegibilidad, supresión, DNC, frecuencia, exclusión por envío reciente | Reglas | No; debe seguir siendo determinista y auditable. |
| Plan de campaña (audiencia, familia, diseño, CTA) | Reglas (playbooks) | No |
| Análisis del reporte (conteos por familia y responsable) | Reglas | No para contar. **Sí** para interpretar los "Motivo campana" en texto libre y priorizar. |
| Resolución de idioma ES/EN/PT | Reglas con evidencia (campo explícito, sistema origen, historial, país, dominio) | **Sí** para los `UNRESOLVED` (por ejemplo, texto de respuestas previas), siempre con confianza y revisión. |
| Copys de email | Motor de copys gobernado con textos aprobados | Opcional: la IA podría proponer variantes, nunca enviarlas. Cada una pasa por Campaign Studio y aprobación. |
| Clasificar respuestas (interesado / no ahora / baja / fuera de oficina) | Sin implementar | **Sí** |
| Resumen mensual en lenguaje natural para Dirección | Métricas por reglas | **Sí** para la redacción; los números siguen saliendo de las reglas. |

## 4. Propuesta: integrar Claude API en el agente AURA existente

**No se conecta ninguna API de pago en este PR.** Esto es una propuesta para tu decisión.

### Arquitectura

- **Dónde vive:** un archivo nuevo, `MarketingV6AuraAgentAi.gs`, dentro del mismo backend de Apps Script. AURA no se reconstruye.
- **Cómo llama a Claude:** con un `UrlFetchApp.fetch` a `https://api.anthropic.com/v1/messages`. Apps Script no tiene SDK oficial, por eso se usa HTTP directo, sin streaming.
- **Cómo se integra:** como nuevas acciones `AUTO` del agente, que solo producen texto o JSON interno y nunca efectos externos. Ejemplos: `AI_INTERPRET_REPORT`, `AI_CLASSIFY_REPLIES`, `AI_SUGGEST_LANGUAGE`.
- **El resultado se guarda** en el ledger del agente (`AURA_AGENT_DECISIONS` / `AURA_AGENT_MEMORY`). Las acciones externas siguen detrás de la aprobación humana existente.
- **Salida estructurada:** `output_config.format` con un JSON Schema por tarea. AURA valida el JSON; si no es válido, la tarea queda en `BLOCKED` y se usan las reglas.
- **Modelo:** `claude-opus-5-5` por defecto, con `output_config.effort` explícito: `low` para clasificación y `medium` para análisis.
  - Pensamiento adaptativo (en este modelo no se puede desactivar).
  - Manejo de `stop_reason: "refusal"` y del mecanismo de respaldo del servidor (`fallbacks: "default"`).
  - Un modelo más barato, como `claude-haiku-5-5` o `claude-sonnet-5-5`, es una decisión tuya, solo si una evaluación muestra la misma calidad.
- **Trabajo masivo** (por ejemplo, clasificar todas las respuestas del mes): con la Message Batches API (50% de descuento). Se envía en un tick y se recogen los resultados en ticks posteriores. Esto también evita el límite de 6 minutos de Apps Script.
- **Caché de prompts:** las instrucciones fijas y los esquemas van primero, con `cache_control`, y los datos variables al final.

### Seguridad

- **API key:**
  - Se guarda solo en Script Properties (`ANTHROPIC_API_KEY`), nunca en el repositorio, que es público.
  - Se usa un workspace dedicado de Anthropic para AURA, con su propio límite de gasto.
- **Interruptor** `AURA_AI_MODE`, con tres valores:
  - `OFF` (por defecto): no se hace ninguna llamada.
  - `SHADOW`: la IA propone y solo se registra.
  - `ON`: las propuestas se muestran en AURA para aprobación.
- **Minimización de datos:** por defecto solo se envían conteos, categorías y textos de "Motivo campana" sin nombres de cuenta ni contactos. Enviar texto de respuestas de clientes (que contiene datos personales) requiere tu aprobación explícita y revisar la retención de datos del proveedor.
- **Inyección de instrucciones:** el contenido de correos y Excel se marca como dato no confiable dentro del prompt. La salida de la IA nunca dispara acciones por sí sola: solo produce propuestas que pasan por las reglas y la aprobación.
- **Sin efectos irreversibles:** la IA no envía correos, no cambia `AURA_SEND_MODE` y no escribe en Salesforce ni Clientify.
- **Auditoría:** cada llamada registra en la hoja `AURA_AI_USAGE` la tarea, el modelo, los tokens de entrada y salida, el costo estimado y el resultado, sin el contenido.

### Costo estimado

Precios de lista de Claude Opus 5.5: $4 por millón de tokens de entrada, $20 por millón de salida y $0,20 por millón de lecturas de caché. El razonamiento se cobra como salida. Las cifras son estimaciones que deben medirse en una prueba piloto.

| Uso | Volumen mensual supuesto | Tokens por llamada (entrada / salida) | Costo estimado/mes |
|---|---|---|---|
| Interpretar cada reporte de Marketing | 4–8 reportes | 20K / 5K | ≈ $1,5 |
| Narrativa de plan de campaña para aprobación | 10 campañas | 10K / 4K | ≈ $1,2 |
| Clasificar respuestas (Batches, −50%) | 200 respuestas | 2K / 1K | ≈ $3 |
| Sugerir idioma para `UNRESOLVED` (Batches) | 500 contactos en lotes de 100 | 8K / 3K | ≈ $0,3 |
| Resumen mensual para Dirección | 1 | 30K / 6K | ≈ $0,25 |
| **Total** | | | **≈ $5–10/mes** |

### Límites de consumo propuestos

- **En Anthropic:** límite de gasto mensual del workspace de AURA en **$25**, con alerta al 50% y al 80%.
- **En AURA (Script Properties):**
  - `AURA_AI_DAILY_CALL_LIMIT` = 50 llamadas por día.
  - `AURA_AI_MONTHLY_USD_LIMIT` = 20, con corte duro: al alcanzarlo, AURA vuelve a usar solo reglas y lo registra.
- **Por llamada:** `max_tokens` acotado por tarea (2K a 8K) y entrada máxima de 50K tokens. Una entrada mayor se resume primero con reglas.
- **Reintentos:** como máximo 2 ante errores 429/5xx, con espera. Nunca se reintenta un 400.

### Plan de adopción sugerido

1. **Evaluación sin costo:** preparar 20–30 casos reales anonimizados por tarea con la respuesta esperada.
2. **Piloto en `SHADOW`** durante 2–4 semanas, con un límite de $10, comparando las propuestas de la IA con las reglas y el criterio de Marketing.
3. **Pasar a `ON`** solo las tareas que superen la evaluación, siempre con aprobación humana en AURA.
