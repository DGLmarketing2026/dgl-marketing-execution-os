# DGL Growth OS — vista previa aislada

## Cómo verla
1. Desde la raíz del repo: `python -m http.server 8765 --bind 127.0.0.1` (o la configuración `aura-static` de `.claude/launch.json`).
2. Abrir `http://localhost:8765/growth/`.
   - **Conectar datos** usa el mismo backend privado y token que Marketing OS, en modo solo lectura salvo las acciones existentes de cada módulo.
   - `http://localhost:8765/tools/growth-qa/index.html` carga un *fixture* de QA, solo para desarrollo, con conteos agregados del ciclo shadow del 7-oct. Sirve para revisar el diseño sin token. No contiene datos personales y ninguna página del producto lo carga.

## Qué cambia y qué no
- **Nuevo:**
  - `growth/index.html`, `growth/growth-shell.js` y `growth/growth-os.css`: navegación en 5 espacios más Administración, la vista Inicio y el diseño.
  - `tools/growth-os-audit.js`: inventario reproducible.
  - `tools/growth-qa/`: fixture de QA visual.
- **Sin cambios:**
  - `index.html` (producción en GitHub Pages);
  - todos los módulos (`assets/js/*`) y su lógica comercial;
  - el backend de Apps Script;
  - AURA, las aprobaciones, las exclusiones y los registros históricos.
- Las 33 rutas existentes siguen accesibles, cada una exactamente una vez (`tests/growth-os-shell.test.js`).

## Pendiente de tu aprobación (afecta producción o puede generar costo)
1. Publicar Growth OS como la experiencia principal: merge a `main`, con lo que se publica en Pages.
2. Archivar los 10 archivos frontend sin consumidores (§2 de `AUDIT.md`).
3. Exponer en el backend `commercialSummary`, `byFamily` e `isTechnical` para eliminar los cálculos duplicados en el cliente. Requiere deploy de Apps Script.
4. Migrar a una app privada: nuevo deployment de Apps Script HtmlService restringido a `dglus.com`. Sin costo, pero requiere un deployment nuevo y, si se quiere un dominio propio, cambios de DNS.
5. Apagar capacidades de Clientify: solo después de alcanzar paridad (§7 de `AUDIT.md`).

## Capturas (fixture de QA)
`docs/growth-os/screenshots/`:
- desktop 1440 × 900: Inicio, Oportunidades, Studio, Resultados, AURA y Administración;
- móvil 390: Inicio;
- `classic-campaign-opportunities.png`, para comparar con la vista actual.
