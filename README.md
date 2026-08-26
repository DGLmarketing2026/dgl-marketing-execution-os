# DGL Marketing Execution OS V5.5 · AM → Marketing Automation

V5.5 structures the active frontend around **AM Request → Marketing Preparation → Marketing Approval → Campaign Active → Customer Response → Handoff to AM**.

**AM decides WHAT. Marketing executes HOW.** Deterministic playbooks and governed workflow logic prepare campaigns without Claude or any AI dependency. Agent Control remains isolated future architecture and is explicitly not connected. See [AM → Marketing Automation V5.5](docs/AM_MARKETING_AUTOMATION_V55.md).

GitHub Pages is presentation-only. Demo data is fictional and contains no customer email addresses, secrets, pricing, credit information, or sensitive profitability values. Real execution and PII require a private authenticated backend.

The V5.5 AM → Marketing workflow can connect to the deployed private Apps Script Data Hub using JSONP. The private token is requested in the browser and retained only for the current tab in `sessionStorage`; it is never committed or stored in `localStorage`. Disconnecting or receiving an unauthorized response clears it immediately. Disconnected mode uses safe fictional fallback records, while connected mode displays private backend records only.

Architecture status: **CONNECTED VIA APPS SCRIPT JSONP**. The frontend is GitHub Pages, the private backend is Google Apps Script, private persistence is `DGL_MARKETING_DATA_HUB`, authentication is browser-session-token only, and Claude remains **NOT CONNECTED / FUTURE LAYER**.

Plataforma interna de ejecución comercial para el área de Marketing de **Dedicated Ground Logistics (DGL)**. No es un dashboard informativo: cada módulo termina en una acción — campaña, email, script o cuenta a trabajar — orientada a convertir, reactivar, retener y crecer la cartera existente de clientes.

## Cómo abrir la plataforma

1. Descomprime la carpeta `DGL-Marketing-Execution-OS` (si la recibiste en `.zip`).
2. Abre el archivo `index.html` haciendo doble clic, o arrástralo a Chrome / Edge / Firefox.
3. No requiere instalación, servidor local ni build. Funciona 100% en el navegador.
4. Requiere conexión a internet la primera vez que se abre (carga la tipografía Inter, los íconos Lucide y Chart.js desde CDN). Una vez cargado, la navegación entre módulos es instantánea y no vuelve a llamar a internet.

> Recomendado: Google Chrome o Microsoft Edge en su versión más reciente, resolución de escritorio 1440px o superior para la mejor experiencia ejecutiva. La plataforma es responsive y también funciona en tablet y mobile.

## Cómo publicar / compartir

- **Uso local interno:** compartir la carpeta completa (no solo `index.html`, ya que depende de `assets/`, `components/` y `data/`).
- **Hosting simple:** subir la carpeta completa a cualquier hosting estático (Netlify, Vercel, GitHub Pages, un bucket S3, o el servidor interno de DGL). No requiere backend.
- **Intranet DGL:** copiar la carpeta a un recurso compartido o servidor interno; cualquier navegador en la red podrá abrir `index.html` vía IIS/Apache/Nginx apuntando a esta carpeta.

## Publicar en GitHub Pages

El proyecto es HTML/CSS/JS puro (sin build step, sin Vite, sin bundler), así que no existe — ni hace falta — un `vite.config.js`. Todas las rutas en `index.html` y en el código son **relativas** (`assets/js/...`, `components/...`, nunca `/assets/...`), por lo que funcionan igual en la raíz de un dominio o en un subdirectorio de proyecto como `https://<usuario>.github.io/<repo>/`. La navegación interna usa hash routing (`#/modulo`), que no requiere configuración de servidor ni reglas de reescritura — es 100% compatible con GitHub Pages.

Checklist para publicar en `https://dedicatedgroundlogistic.github.io/dgl_marketing_os/`:

1. El repositorio debe llamarse `dgl_marketing_os` (o usar Pages en un repo con ese nombre) y el contenido de esta carpeta (`index.html`, `assets/`, `components/`, `data/`, `.nojekyll`) debe quedar en la **raíz** del repo (o en `/docs` si configuras Pages así) — no dentro de una subcarpeta adicional como `DGL-Marketing-Execution-OS/DGL-Marketing-Execution-OS/`.
2. Sube también el archivo `.nojekyll` (incluido en este proyecto, sin extensión, contenido vacío). Sin él, GitHub Pages procesa el sitio con Jekyll, que en algunos repos ignora o reordena carpetas de forma inesperada — es la causa más común de "funciona local, no funciona en Pages".
3. Confirma que **todas** las carpetas se subieron: Git no sube carpetas vacías, pero si usaste el uploader web de GitHub arrastrando archivos sueltos (en vez de arrastrar las carpetas `assets/` y `components/` completas), es fácil que falten archivos sin que se note. Revisa en GitHub.com que existan `assets/js/app.js`, `assets/js/data.js`, `assets/js/modules.js`, `assets/js/interactions.js`, `assets/js/charts.js`, `assets/css/styles.css`, `assets/css/responsive.css` y los 7 archivos dentro de `components/`.
4. Espera 1–2 minutos después de cada push (o revisa la pestaña **Actions** del repo) — GitHub Pages tarda un poco en desplegar.
5. Si algo sigue sin cargar, abre la URL publicada, presiona F12 → pestaña **Console**: la plataforma ahora muestra un panel de diagnóstico en pantalla (en vez de quedarse cargando para siempre) indicando exactamente qué archivo devolvió error 404 o qué excepción de JavaScript ocurrió.

## Estructura del proyecto

```
DGL-Marketing-Execution-OS/
├── index.html                  → Punto de entrada de la plataforma
├── README.md                   → Este archivo
├── package-info.txt            → Descripción técnica de la arquitectura
├── assets/
│   ├── css/
│   │   ├── styles.css          → Sistema de diseño (colores, tipografía, componentes)
│   │   └── responsive.css      → Reglas responsive (desktop → laptop → tablet → mobile)
│   └── js/
│       ├── data.js             → Capa de datos de muestra (SAMPLE DATA)
│       ├── charts.js           → Wrappers de Chart.js con tema DGL
│       ├── modules.js          → Renderizado de los 16 módulos funcionales
│       ├── interactions.js     → Modales, filtros, búsqueda global, toasts, sidebar
│       └── app.js              → Router y ensamblaje del shell de la aplicación
├── components/
│   ├── sidebar.js               → Navegación lateral agrupada y colapsable
│   ├── header.js                → Topbar: búsqueda global, quick actions, usuario
│   ├── kpi-cards.js             → Tarjetas KPI ejecutivas
│   ├── campaign-cards.js        → Tarjetas de campaña accionables
│   ├── tables.js                → Tablas inteligentes (+ vista de cards en mobile)
│   ├── modals.js                → Sistema de modales reutilizable
│   └── filters.js                → Barra de filtros + helpers de UI (empty states, skeletons)
└── data/
    ├── sample-customers.json
    ├── sample-campaigns.json
    ├── sample-opportunities.json
    └── sample-assets.json
```

## Módulos incluidos

1. Executive Marketing Command Center
2. Campaign Execution Center
3. Email Marketing Center
4. Quoted Not Booked Recovery
5. Reactivation Center
6. Customer Growth Center
7. Account-Based Marketing Center
8. Customer Retention Campaigns
9. Sales Enablement Center
10. Automation Playbooks
11. Content & Asset Library
12. Marketing Analytics
13. Nova & Salesforce Insights (integración conceptual)
14. Business Intelligence for Marketing
15. SEO / GEO Intelligence
16. Governance & Approvals

## Sobre los datos

Todos los datos (cuentas, cotizaciones, campañas, secuencias, assets, KPIs) son **datos de muestra (sample data)** diseñados para representar de forma realista la operación de un Freight Broker en Norteamérica. No contienen información real de clientes de DGL. Están marcados en la interfaz con la etiqueta **Sample Data**.

## Cómo editar el proyecto

- **Cambiar datos:** edita `assets/js/data.js` (fuente única de verdad que usa toda la plataforma) y, si quieres mantenerlos sincronizados, los archivos espejo en `data/*.json`.
- **Cambiar colores / marca:** edita las variables CSS en la parte superior de `assets/css/styles.css` (`:root { --primary; --secondary; ... }`).
- **Agregar un módulo nuevo:** define su renderer en `assets/js/modules.js`, regístralo en `DGL_MODULE_RENDERERS`, y agrégalo a `MODULE_GROUPS` en `assets/js/app.js`.
- **Conectar datos reales (Salesforce / Nova / CRM):** sustituye las funciones de `assets/js/data.js` por llamadas a tu API o capa de integración; el resto de la plataforma (componentes, módulos, gráficos) ya está preparado para consumir esa misma forma de datos.

## Próximos pasos recomendados

- Conectar Salesforce (Lane Quotes, cuentas, oportunidades) y Nova (TMS / Loads) como fuente de datos real, sustituyendo `data.js`.
- Integrar el motor de envío de email (HubSpot, Klaviyo, Salesforce Marketing Cloud, etc.) para que las secuencias del módulo Email Marketing Center se disparen de verdad.
- Definir permisos de usuario (Marketing, Ventas, Account Management, Dirección) si se despliega como intranet compartida.
