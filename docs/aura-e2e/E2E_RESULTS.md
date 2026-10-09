# AURA: prueba de punta a punta de recepción automática de reportes (datos sintéticos)

Generado por `node tools/aura-e2e/run-e2e.js` (rama `feat/aura-report-intake-info`). Resultado: **19/19 PASS**.

## Qué es real y qué es simulado

- **Real:**
  - el código de AURA que se despliega en Apps Script (ingesta, refresco de oportunidades, agente y helpers de idioma);
  - los archivos `.xlsx` sintéticos de `tools/aura-e2e/fixtures/`.
- **Simulado** (no hay un entorno de Google de pruebas autorizado):
  - el buzón de pruebas;
  - la conversión XLSX→Sheets de Drive (la hace openpyxl sobre el mismo archivo);
  - el Data Hub (en memoria);
  - el programador de triggers de Apps Script. Este solo dispara los handlers que el propio AURA instaló con `ScriptApp.newTrigger`; ninguna función del flujo se llama directamente.
- **Sin red:** `UrlFetchApp`, `MailApp` y los envíos de `GmailApp` cuentan las llamadas y fallan.

## Resultados

| Etapa | Verificación | Resultado | Evidencia |
|---|---|---|---|
| Programación | AURA instala sus propios triggers horarios y la prueba solo los dispara | **PASS** | auraReportIntakeTick c/1h, auraAgentTick c/1h; 10 ejecuciones programadas |
| Detección | El reporte de un remitente interno verificado (que no está en la lista) se detecta en la bandeja de Marketing | **PASS** | QA-M1 OK / VERIFIED_INTERNAL_SENDER |
| Detección | Los correos suplantados y externos nunca se abren | **PASS** | No hay entradas en el registro para QA-SPOOF ni QA-EXT; 1 no confiable omitido |
| Detección | Un Excel interno que no es un reporte se ignora | **PASS** | QA-NOTREPORT NOT_A_MARKETING_REPORT |
| Lectura del Excel | Se lee el XLSX real (6 pestañas) mediante la conversión | **PASS** | 8 filas aceptadas en las pestañas reconocidas |
| Validación | Las filas sin cuenta o sin responsable se rechazan y registran | **PASS** | MISSING ACCOUNT (Cuenta) / MISSING AM OWNER |
| Validación | No se crean oportunidades desde las pestañas de calidad de datos ni desconocidas | **PASS** | Se ignoran "Confirmar datos contacto" y "Campana B - nueva" |
| Deduplicación | El mismo archivo reenviado da DUPLICATE_REPORT y no se vuelve a convertir | **PASS** | Conversiones tras el duplicado: 2 (v1 + no-reporte) |
| Deduplicación | Una cuenta en dos familias pasa una sola vez a la cola (las demás se suprimen por prioridad) | **PASS** | 1 oportunidades suprimidas |
| Deduplicación | En una hora sin correo nuevo la recepción no lee el Data Hub | **PASS** | Lecturas del registro de ingesta en la hora inactiva: 0 |
| Interpretación | Tarea automática de análisis por reporte, con conteos y sin nombres | **PASS** | Por familia: {"Retention":3,"Reactivation":3,"Cross-Sell":1,"Activation":1}, planificables: {"RETENTION":3,"REACTIVATION":3,"CROSS_SELL":1} |
| Preparación | Planes de campaña Retention/Reactivation/Cross-Sell preparados automáticamente | **PASS** | RETENTION: 3 destinatarios; REACTIVATION: 2 destinatarios; CROSS_SELL: 2 destinatarios |
| Preparación | Se aplican las exclusiones de gobernanza (DNC, email inválido, duplicado, envío reciente) | **PASS** | RETENTION dnc=1 inválidos=1 dup=1 recientes=0 sinIdioma=0; REACTIVATION dnc=0 inválidos=0 dup=0 recientes=1 sinIdioma=0; CROSS_SELL dnc=0 inválidos=0 dup=0 recientes=0 sinIdioma=0 |
| Preparación | Idioma ES/EN/PT resuelto por contacto | **PASS** | RETENTION {"ES":2,"EN":0,"PT":1,"UNRESOLVED":0}; REACTIVATION {"ES":0,"EN":2,"PT":0,"UNRESOLVED":0}; CROSS_SELL {"ES":1,"EN":1,"PT":0,"UNRESOLVED":0} |
| Aprobación pendiente | Una aprobación PENDING por familia y ninguna aprobada automáticamente | **PASS** | RETENTION: APPROVAL/PENDING; REACTIVATION: APPROVAL/PENDING; CROSS_SELL: APPROVAL/PENDING |
| Reporte actualizado | Un reporte más nuevo genera un análisis nuevo y recalcula el plan pendiente sin duplicar aprobaciones | **PASS** | CROSS_SELL cuentas 1 -> 2; aprobaciones: 3 |
| Seguridad | Ningún envío: Gmail, MailApp, borradores y llamadas HTTP en 0 | **PASS** | {"gmailSend":0,"gmailDraft":0,"mailApp":0,"urlFetch":0} |
| Seguridad | La cola de envío no cambió y AURA_SEND_MODE sigue en DRY_RUN | **PASS** | cola sin cambios=true, modo=DRY_RUN |
| Seguridad | Solo se escribió en tablas internas de AURA (nada de Salesforce, Clientify ni producción) | **PASS** | AURA_AGENT_ACTIONS, AURA_AGENT_APPROVALS, AURA_AGENT_DECISIONS, AURA_AGENT_EVENTS, AURA_AGENT_MEMORY, AURA_AGENT_METRICS, AURA_AGENT_RUNS, AURA_AGENT_TASKS, MKT_AURA_GMAIL_OPPORTUNITIES, MKT_AURA_INGEST_LOG, MKT_AURA_INGEST_REJECTIONS, MKT_OPPORTUNITIES |

## Ejecuciones programadas

| Hora (UTC) | Handler | Resultado |
|---|---|---|
| 08:38 | `auraAgentTick` | COMPLETED · tareas creadas 0 |
| 09:10 | `auraReportIntakeTick` | OK · procesados 2, OK 1, duplicados 0, no-reporte 1, no confiables 1 · refresco REPORT_SOURCE_SYNCED |
| 09:38 | `auraAgentTick` | COMPLETED · tareas creadas 4 |
| 10:10 | `auraReportIntakeTick` | OK · procesados 1, OK 0, duplicados 1, no-reporte 0, no confiables 1 |
| 10:38 | `auraAgentTick` | COMPLETED · tareas creadas 0 |
| 11:10 | `auraReportIntakeTick` | OK · procesados 0, OK 0, duplicados 0, no-reporte 0, no confiables 1 |
| 11:38 | `auraAgentTick` | COMPLETED · tareas creadas 0 |
| 12:38 | `auraAgentTick` | COMPLETED · tareas creadas 0 |
| 13:10 | `auraReportIntakeTick` | OK · procesados 1, OK 1, duplicados 0, no-reporte 0, no confiables 1 · refresco REPORT_SOURCE_SYNCED |
| 13:38 | `auraAgentTick` | COMPLETED · tareas creadas 1 |

## Observaciones de la prueba (no son fallos del flujo)

1. **Cuentas sin contactos en el CRM no se pueden contactar.** Los destinatarios salen de `MKT_CONTACTS_SECURE` (sincronización del CRM); las columnas Contacto/Email del Excel no se importan. Ejemplo: "QA Mudanzas Norte" está en el reporte, pero no aporta destinatarios (Reactivation: 2 cuentas elegibles, 2 destinatarios).
2. **El mismo email puede aparecer en planes de dos familias.** Un contacto compartido aparece en Retention y en Reactivation. El plan deduplica solo dentro de cada familia. Según el propio plan, la frecuencia se vuelve a aplicar al construir el envío; esa parte no se ejerció en esta prueba.
3. **Una pestaña nueva sin mapeo se ignora** ("Campana B - nueva"). Queda fuera hasta que una persona la agregue al mapa de familias.
4. **El texto libre de "Motivo campana" no se usa** para priorizar ni para adaptar el mensaje: hoy solo se guarda como referencia.

## Decisiones del motor actual: reglas vs. IA

| Decisión observada en la prueba | Hoy (reglas) | ¿Mejora real con IA? |
|---|---|---|
| Confiar en el remitente, detectar el reporte, descartar duplicados y no-reportes | Correcto en todos los casos de la prueba | No. Debe seguir siendo determinista y auditable. |
| Validar filas (sin cuenta / sin responsable) | Correcto (2 rechazos registrados) | No. |
| Mapear pestañas a familias | Correcto para las conocidas; ignora las nuevas | **Sí, moderada:** sugerir la familia de una pestaña nueva para que una persona la confirme. |
| Elegibilidad, supresión por prioridad, DNC, email inválido, duplicados, envío reciente | Correcto | No. Son reglas de gobierno y deben ser exactas. |
| Idioma por contacto | Correcto con datos de país o explícitos | **Sí, acotada:** solo para contactos `UNRESOLVED` sin país, con evidencia y revisión. |
| Prioridad entre cuentas y argumento del mensaje | No usa el "Motivo campana" | **Sí, la mayor mejora:** interpretar el motivo en texto libre para priorizar y proponer el ángulo del mensaje, siempre con aprobación. |
| Plan de campaña (diseño, CTA, familia) | Playbooks fijos | Baja: los playbooks ya están aprobados. La IA solo propondría variantes. |
| Aprobar o enviar | Siempre una persona | **Nunca** debe decidirlo la IA. |
