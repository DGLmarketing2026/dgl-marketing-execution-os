# HANDOFF — DGL Growth OS

## Estado actual
- **Rama:** `feat/growth-os-v1`. `main` no se modificó y sigue igual a lo publicado (`6c0cf87`).
- **Publicación:** nada publicado. GitHub Pages solo publica `main`.
- **Implementaciones:** detenidas por solicitud. Ninguno de los 5 cambios propuestos está autorizado: publicar, archivar archivos, cambios de backend, app privada y Clientify.
- **Qué contiene:** una vista previa aislada que reutiliza los módulos actuales **sin cambiar su lógica**. Lo nuevo es la navegación en 5 espacios (Inicio, Oportunidades, Campañas, Resultados, AURA), la vista de Inicio, el diseño y Administración por separado.

## Archivos (todos nuevos; ningún archivo existente modificado)
| Archivo | Propósito |
|---|---|
| `growth/index.html` | Entrada aislada. Carga los mismos scripts que `index.html`, salvo `app.js`. |
| `growth/growth-shell.js` | Navegación en 5 espacios + Administración, vista Inicio, etiqueta de origen de datos por vista, comprobación de vistas. |
| `growth/growth-os.css` | Diseño premium con la identidad DGL (navy #05035C, verde #77B82A, blanco). |
| `tests/growth-os-shell.test.js` | Pruebas del shell. |
| `tools/growth-os-audit.js` | Inventario de dependencias (solo lectura). Genera `docs/growth-os/inventory.json`. |
| `tools/growth-qa/*` | Página de QA con datos de prueba, marcada "DATOS DE PRUEBA". Solo para desarrollo. |
| `docs/growth-os/AUDIT.md`, `README.md`, `inventory.json`, `screenshots/` | Auditoría, guía y capturas. |
| `HANDOFF_GROWTH_OS.md` | Este documento. |

## Funcionalidades terminadas
- 5 espacios diarios + Administración separada (Diagnóstico, Gobernanza, Arquitectura AURA, Command Center clásico, Account 360).
- Las 33 rutas actuales siguen accesibles, cada una una sola vez. Los enlaces heredados (`#/campaign-studio`, etc.) siguen funcionando.
- Inicio nuevo: oportunidades elegibles, campañas por aprobar en AURA, última campaña (corrida actual / histórico / total) y estado de AURA. Solo usa datos que ya calcula el backend.
- Cada vista indica su origen: datos del backend privado, referencia sin datos en vivo, o contenido de ejemplo.
- Administración → "Comprobar todas las vistas": abre cada vista una vez, sin escribir nada, y reporta cuáles cargaron.
- Versión móvil con barra inferior.

## Pendiente
- **Probar con datos reales:** requiere conectar con tu token. Yo no lo ingreso.
- **Las 5 decisiones que requieren tu aprobación**, detalladas en `docs/growth-os/AUDIT.md`:
  1. publicar;
  2. archivar los 10 archivos sin uso;
  3. mover al backend los cálculos duplicados (commercialSummary, byFamily, isTechnical);
  4. app privada en Apps Script restringida a `dglus.com`;
  5. reemplazo gradual de Clientify.
- **Vistas sin datos en vivo:** Gobernanza, Account 360 y Contenidos son de referencia. Arquitectura AURA es contenido de ejemplo.

## Pruebas y resultados
- **Suite completa:** 75/75 archivos pasan, incluido `tests/growth-os-shell.test.js` (6 comprobaciones).
- **Sin conexión, en el navegador:** las 35 vistas cargan sin errores.
- **Navegación entre módulos:** de una oportunidad, "Prepare campaign" lleva a Studio.
- **Móvil (390 px):** sin desborde horizontal en Inicio, Oportunidades, QNB, Studio, Reportes, AURA y Administración.
- **Sin verificar por mí:** las vistas conectadas a datos reales, porque requieren token.

## Cómo iniciar la vista previa local
```bash
git worktree add ../dgl-growth-os-preview feat/growth-os-v1   # solo si no existe
python -m http.server 8770 --bind 127.0.0.1 --directory ../dgl-growth-os-preview
```
- Abrir `http://localhost:8770/growth/` y pulsar **Conectar datos**. Pide el token una vez para este origen.
- Para revisar el diseño sin datos reales: `http://localhost:8770/tools/growth-qa/index.html`.
- En Claude Code existe la configuración `growth-os-preview` en `.claude/launch.json` (puerto 8770).

## Instrucciones para continuar
1. Revisar la vista previa con datos reales y anotar ajustes.
2. Hacer los ajustes solo en `feat/growth-os-v1` y correr la suite: `for f in tests/*.test.js; do node "$f"; done`.
3. Antes de publicar, pedir aprobación explícita. Hacer merge a `main` publica en GitHub Pages; ojo: el repositorio es **público**.
4. No archivar archivos ni tocar Apps Script, Salesforce, NOVA, DNS, Clientify o las integraciones sin aprobación.
