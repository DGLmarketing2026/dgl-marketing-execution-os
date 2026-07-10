/**
 * DGL Marketing Execution OS — App Shell / Router
 * Registers the module map, renders sidebar + header once,
 * and swaps the main content on hash change.
 */
(function (global) {
  "use strict";

  const MODULE_GROUPS = [
    {
      label: "Comando Ejecutivo",
      items: [
        { id: "command-center", label: "Executive Command Center", icon: "layout-dashboard", group: "Comando Ejecutivo" }
      ]
    },
    {
      label: "Ejecución Comercial",
      items: [
        { id: "campaign-execution", label: "Campaign Execution Center", icon: "megaphone", group: "Ejecución Comercial", badge: "7" },
        { id: "email-marketing", label: "Email Marketing Center", icon: "mail", group: "Ejecución Comercial" },
        { id: "quoted-not-booked", label: "Quoted Not Booked Recovery", icon: "file-warning", group: "Ejecución Comercial", badge: "8" },
        { id: "reactivation", label: "Reactivation Center", icon: "refresh-cw", group: "Ejecución Comercial" },
        { id: "growth", label: "Customer Growth Center", icon: "trending-up", group: "Ejecución Comercial" },
        { id: "abm", label: "Account-Based Marketing", icon: "crosshair", group: "Ejecución Comercial" },
        { id: "retention", label: "Customer Retention", icon: "shield-check", group: "Ejecución Comercial" }
      ]
    },
    {
      label: "Habilitación & Contenido",
      items: [
        { id: "sales-enablement", label: "Sales Enablement Center", icon: "briefcase", group: "Habilitación & Contenido" },
        { id: "automation-playbooks", label: "Automation Playbooks", icon: "workflow", group: "Habilitación & Contenido" },
        { id: "content-library", label: "Content & Asset Library", icon: "folder-open", group: "Habilitación & Contenido" }
      ]
    },
    {
      label: "Inteligencia",
      items: [
        { id: "analytics", label: "Marketing Analytics", icon: "bar-chart-3", group: "Inteligencia" },
        { id: "nova-insights", label: "Nova & Salesforce Insights", icon: "database", group: "Inteligencia" },
        { id: "business-intelligence", label: "Business Intelligence", icon: "globe", group: "Inteligencia" },
        { id: "seo-geo", label: "SEO / GEO Intelligence", icon: "search", group: "Inteligencia" }
      ]
    },
    {
      label: "Gobierno",
      items: [
        { id: "governance", label: "Governance & Approvals", icon: "check-square", group: "Gobierno" }
      ]
    }
  ];

  const ALL_MODULES = MODULE_GROUPS.flatMap((g) => g.items);
  const DEFAULT_MODULE = "command-center";

  function getModuleById(id) {
    return ALL_MODULES.find((m) => m.id === id) || ALL_MODULES.find((m) => m.id === DEFAULT_MODULE);
  }

  function currentRouteId() {
    const hash = window.location.hash.replace("#/", "").trim();
    return ALL_MODULES.some((m) => m.id === hash) ? hash : DEFAULT_MODULE;
  }

  function renderShellOnce() {
    const root = document.getElementById("app");
    root.innerHTML = `
      <div class="app-shell" id="appShell">
        ${window.DGL_UI.renderSidebar(MODULE_GROUPS, DEFAULT_MODULE)}
        <div class="shell-main">
          <div id="headerMount"></div>
          <main class="main-content" id="mainContent"></main>
        </div>
      </div>
      <div class="quick-actions-fab" id="quickFab" style="display:none;position:fixed;bottom:20px;right:20px;z-index:150">
        <button class="btn btn-primary" style="border-radius:999px;width:54px;height:54px;padding:0;box-shadow:0 10px 26px rgba(119,184,42,0.4)" data-action="open-create-campaign">
          <i data-lucide="plus"></i>
        </button>
      </div>
      <nav class="bottom-nav" id="bottomNav" style="display:none;position:fixed;bottom:0;left:0;right:0;background:#0a0c1e;border-top:1px solid var(--border);padding:8px 6px;justify-content:space-around;z-index:140">
        <a href="#/command-center" class="nav-item" style="flex-direction:column;gap:2px;font-size:9.5px;padding:6px"><i data-lucide="layout-dashboard"></i>Home</a>
        <a href="#/campaign-execution" class="nav-item" style="flex-direction:column;gap:2px;font-size:9.5px;padding:6px"><i data-lucide="megaphone"></i>Campañas</a>
        <a href="#/quoted-not-booked" class="nav-item" style="flex-direction:column;gap:2px;font-size:9.5px;padding:6px"><i data-lucide="file-warning"></i>Cotiz.</a>
        <a href="#/reactivation" class="nav-item" style="flex-direction:column;gap:2px;font-size:9.5px;padding:6px"><i data-lucide="refresh-cw"></i>Reactiv.</a>
        <a href="#/analytics" class="nav-item" style="flex-direction:column;gap:2px;font-size:9.5px;padding:6px"><i data-lucide="bar-chart-3"></i>Analytics</a>
      </nav>
    `;

    document.getElementById("quickFab").style.display = "";
    document.getElementById("bottomNav").style.display = "";
  }

  function renderRoute() {
    const id = currentRouteId();
    const mod = getModuleById(id);
    const mainEl = document.getElementById("mainContent");
    const headerMount = document.getElementById("headerMount");

    headerMount.innerHTML = window.DGL_UI.renderHeader(mod);

    // Loading skeleton (brief) for perceived performance / premium feel
    mainEl.innerHTML = window.DGL_UI.skeletonKpis(4);
    if (window.lucide) window.lucide.createIcons();

    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          const renderer = window.DGL_MODULE_RENDERERS[id];
          if (renderer) {
            renderer(mainEl);
          } else {
            mainEl.innerHTML = window.DGL_UI.emptyState({ icon: "alert-triangle", title: "Módulo no encontrado", text: "Selecciona un módulo del menú lateral." });
          }
        } catch (err) {
          console.error("DGL Marketing OS — error renderizando módulo '" + id + "':", err);
          mainEl.innerHTML = window.DGL_UI.emptyState({
            icon: "alert-triangle",
            title: "No se pudo cargar este módulo",
            text: "Ocurrió un error al renderizar '" + mod.label + "'. Revisa la consola del navegador (F12) para más detalle. " + (err && err.message ? err.message : "")
          });
        }
        window.DGL_UI.setActiveNav(id);
        if (window.lucide) window.lucide.createIcons();
      }, 160);
    });
  }

  function init() {
    try {
      renderShellOnce();
      window.DGL_INTERACTIONS.initShellInteractions();
      window.DGL_INTERACTIONS.initGlobalSearch();
      window.addEventListener("hashchange", renderRoute);
      if (!window.location.hash) window.location.hash = "#/" + DEFAULT_MODULE;
      renderRoute();
      if (window.lucide) window.lucide.createIcons();
      if (window.__dglMarkReady) window.__dglMarkReady();
    } catch (err) {
      console.error("DGL Marketing OS — fallo al iniciar la plataforma:", err);
      if (window.__dglBootFail) {
        window.__dglBootFail("Error al iniciar la aplicación: " + (err && err.message ? err.message : err) + ". Es probable que falte cargar assets/js/data.js, un archivo dentro de components/, o assets/js/charts.js — revisa la pestaña Network del navegador (F12) para ver qué archivo devolvió 404.");
      }
    }
  }

  document.addEventListener("DOMContentLoaded", init);

  global.DGL_APP = { MODULE_GROUPS, ALL_MODULES };
})(window);
