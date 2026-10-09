# DGL Growth OS — Auditoría e inventario de dependencias

Base: `main` @ `6c0cf87`. Incluye los cambios del 7-oct-2026: PRs #24–#32, Command Center bundle, Agent Runtime con Sheets API y resolución de idioma.

El inventario completo es reproducible con `node tools/growth-os-audit.js`, que genera `docs/growth-os/inventory.json`. Ese script solo lee.

## 1. Estado actual (resumen)

| Capa | Hallazgo |
|---|---|
| Frontend | `index.html` carga 35 scripts. Hay 51 archivos en `assets/js` + `components`. **16 archivos no se cargan** (detalle en §2). |
| Navegación | 33 rutas en 12 grupos de menú. Algunas son placeholders o vistas futuras (`agent-control`, `account-360`) mezcladas con las operativas. |
| Renderers | El registro global `DGL_MODULE_RENDERERS` lo escriben 11 archivos. Las versiones anteriores también registran rutas (`modules.js`, `marketing-os-v54-modules.js`, `campaign-studio-v3/v4/v5`…). Como no se cargan, el último registro gana (verificado en tiempo de ejecución, §3). |
| Backend | 50 archivos `.gs` en 3 carpetas (`live-core`, `legacy-v55`, `v6`). Hay un solo `doGet` y un solo `doPost`. API privada por allowlist en `MarketingV55Backend.gs` y router en `MarketingV6RouterExtension.gs`. |
| Datos | Un Data Hub en Google Sheets (`DGL_MARKETING_DATA_HUB`) es la fuente de AURA, campañas, cola y eventos. El acceso por SpreadsheetApp es frágil (timeouts del 7-oct); el agente ya usa la Sheets API. |

## 2. Archivos frontend no cargados por `index.html`

No se borra ninguno en esta rama: primero se validan sus dependencias. Lo que sigue es lo verificado.

| Archivo | Líneas | Referenciado por tests | Observación |
|---|---|---|---|
| `modules.js` | 810 | no | V5.4: registraba casi todas las rutas. Reemplazado por `lifecycle-modules-v6.js`. |
| `marketing-campaign-os-v2.js` | 513 | no | V2: servicio, atribución y canales. Reemplazado. |
| `campaign-studio-v3.js` / `-v4.js` | 402 / 549 | no | Reemplazados por v5 + v6. **v5 sigue cargado**: lo usa v6 (scope bridge). |
| `account-growth-os-v112.js` | 365 | no | `priority-queue` y `account-360` ahora en lifecycle v6. |
| `google-apps-script-bridge.js` | 772 | 3 tests | Bridge V5.5 retirado del flujo activo. Los tests verifican que **no** se cargue. |
| `data.js` | 482 | no | Datos demo (define `DGL_API` igual que el bridge). Riesgo si se recarga: datos de muestra. |
| `charts.js`, `creative-library-v4.js`, `ai-copy-engine-v4.js` | 239 / 187 / 162 | no | Sin consumidores cargados. |
| `campaign-opportunities-v6.js`, `campaign-opportunity-center-v5.js`, `campaign-audience-bridge-v55.js` | 21 / 42 / 43 | 2–3 tests | Los tests los leen como fuente. Requieren revisión antes de borrar. |
| `marketing-agent-contract-v1.js` | 61 | no | Duplica `DGL_MARKETING_STOP_CONDITIONS` (lo define también `marketing-playbooks-v55.js`, que sí está cargado). |
| `marketing-os-v54-modules.js`, `marketing-os-v6.js` | 16 / 8 | 0–1 | Stubs de registro. |

**Recomendación:** mover los 10 archivos sin consumidores ni tests a `archive/legacy-frontend/` en un PR propio, con la suite y la QA visual como gate. Los referenciados por tests se migran junto con sus pruebas.

## 3. Ruta → archivo que la renderiza (verificado en el navegador)

- `lifecycle-modules-v6.js` (20 rutas): command-center, campaign-opportunities, retention, reactivation, quoted-not-booked, growth, campaign-execution, email-marketing, service/ftl/ltl/drayage-marketing, priority-queue, account-360, campaign-attribution, analytics, account-campaign-reports, governance, content-library, channel-orchestration.
- `acquisition-visual-v3.js`: acquisition-command-center, landing-pages, channel-orchestration*, paid-media, linkedin-acquisition, outbound-acquisition, lead-capture, lead-routing, acquisition-attribution.
- `acquisition-automation-v2.js`: automation-playbooks. `acquisition-experience-v1.js`: content-library.
- `campaign-studio-v6.js`: campaign-studio. `aura-dashboard-v1.js`: aura-overview. `account-campaign-pipeline-v6.js`: account-campaign-pipeline. `agent-control-v1.js`: agent-control.

\* En varias rutas el archivo cargado después sobrescribe al anterior; la cadena se documenta en `index.html`.

**Duplicidades detectadas:**
- Tres capas de adquisición (v1 → v2 → v3) que se sobrescriben en orden.
- Studio v5 + v6 con bridge.
- Dos definiciones de `DGL_MARKETING_STOP_CONDITIONS` y dos de `DGL_API`, ambas en archivos no cargados.

## 4. Nueva arquitectura de navegación (implementada en `growth/`)

| Espacio | Vistas (renderers existentes, sin cambios de lógica) |
|---|---|
| **Inicio** | Resumen nuevo: oportunidades elegibles, aprobaciones de AURA, última campaña (corrida actual / histórico / total) y estado de AURA. Usa solo datos que ya calcula el backend. |
| **Oportunidades** | Todas · QNB · Retención · Reactivación · Cross-sell · Servicio (por servicio, FTL, LTL, Drayage) · Cuentas (pipeline, prioridad) |
| **Campañas** | Studio · Control · Email · Journeys · Contenidos · Nuevos negocios (adquisición, landing pages, captura, ruteo, canales, paid media, LinkedIn, outbound) |
| **Resultados** | Reportes · Analítica · Atribución · Atribución de adquisición |
| **AURA** | Command Center (agente, aprobaciones, comandos, KPIs por alcance) |
| **Administración** *(separada, ícono en el riel)* | Diagnóstico (conexión, requests, latencias) · Gobernanza · Arquitectura AURA · Command Center clásico · Account 360 |

Los hashes heredados (`#/campaign-studio`, `#/aura-overview`, …) siguen siendo canónicos. Así funcionan sin cambios los módulos que leen o fijan `location.hash`: Studio, reportes con auto-refresh y AURA.

## 5. Responsabilidades: Salesforce · NOVA · Marketing OS

| Sistema | Es dueño de | No debe |
|---|---|---|
| **Salesforce** | Cuentas, contactos, oportunidades, cotizaciones y cargas (sistema de registro). Owner (AM). | Recibir escrituras automáticas de Marketing OS sin aprobación (`UPDATE_SALESFORCE` = APPROVAL_REQUIRED, deshabilitado en V1). |
| **NOVA** | Ingesta y reporte comercial (RFQ, cotizaciones, export `NOVA_MARKETING_EXPORT`) que alimenta el Data Hub. | Ser invocado por AURA (son sistemas independientes). |
| **Marketing OS / Growth OS** | Detección de oportunidades sobre el export, campañas gobernadas, cola, tracking, AURA, KPIs de marketing. | Recalcular métricas comerciales que vienen de Salesforce/NOVA. |

**Cálculos duplicados encontrados:**
1. KPIs de email: el backend (`v6AuraEmailPerformance_`) y el frontend (`commercialSummary` en `aura-dashboard-v1.js`) recalculan totales comerciales cuando hay campañas de QA. *Propuesta:* que el backend exponga `commercialSummary` y el frontend solo lo muestre.
2. Agregados de oportunidades: `lifecycle-modules-v6.js` re-agrupa los `groups` del backend por familia y owner. Es presentación, aceptable. *Propuesta:* exponer `byFamily` en `v6Opportunities` para no repetir reglas de familia en el cliente.
3. Clasificación técnica/QA: la regex de QA vive en el dashboard y en Inicio. *Propuesta:* un campo `isTechnical` calculado en el backend.

Ninguno de los tres cambia cifras comerciales. Se dejan documentados para un PR de backend, sin tocar producción.

## 6. Migración fuera de GitHub Pages (preparada, sin ejecutar)

El shell nuevo es estático y usa rutas relativas, así que puede servirse desde cualquier origen. Opciones sin costo adicional:
- **A. Apps Script HtmlService** (recomendada):
  - acceso restringido al dominio `dglus.com`;
  - elimina el token compartido en `localStorage`, porque la identidad la da Google;
  - las llamadas pasan de JSONP a `google.script.run`, con el adapter como único punto de cambio.
- **B. Firebase Hosting / Cloud Run + IAP:** más control, pero puede generar costo. Requiere aprobación.

Pasos de la opción A:
1. Crear el adapter `transport: "gas"`.
2. Agregar `doGet` de app servida.
3. Publicar un deployment *nuevo*, sin tocar el actual.
4. Validar en paralelo.
5. Mover el DNS solo con aprobación.

Nada de esto se ejecuta en esta rama.

## 7. Clientify — reemplazo gradual sin desconectar

No hay integración de Clientify en el código: es una herramienta externa paralela. Propuesta por capacidades, manteniéndolo conectado hasta la paridad:

| Capacidad Clientify | Equivalente en Growth OS | Estado |
|---|---|---|
| Email marketing | Campañas gobernadas (Studio → DRY_RUN → GO LIVE) con tracking OPEN/CLICK | Disponible |
| Formularios / landing | Acquisition Engine + WordPress (aprobación) | Disponible, con publicación gated |
| CRM / pipeline | Salesforce (sistema de registro) | No replicar |
| Automatizaciones | AURA (aprobación por campaña) | Shadow mode |
| WhatsApp / social | Metricool (no conectado) | Pendiente |

Criterio de corte: 2 ciclos de campaña en Growth OS con paridad de métricas antes de apagar cada capacidad en Clientify.
