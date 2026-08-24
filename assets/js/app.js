/**
 * DGL Marketing Campaign OS — App Shell / Router V5
 */
(function (global) {
  "use strict";

  const MODULE_GROUPS = [
    {
      label: "COMMAND",
      items: [
        { id: "command-center", label: "Marketing Campaign Command Center", icon: "layout-dashboard", group: "Comando Ejecutivo" }
      ]
    },
    {
      label: "CAMPAIGNS",
      items: [
        { id: "campaign-opportunities", label: "AM Campaign Requests", icon: "clipboard-list", group: "Campaigns" },
        { id: "campaign-execution", label: "Campaign Control", icon: "megaphone", group: "Campaigns" },
        { id: "campaign-studio", label: "Campaign Studio", icon: "palette", group: "Campaigns" },
        { id: "reactivation", label: "Reactivation Campaigns", icon: "refresh-cw", group: "Campaigns" },
        { id: "quoted-not-booked", label: "Quoted Not Booked", icon: "file-warning", group: "Campaigns" },
        { id: "growth", label: "Cross-Sell Campaigns", icon: "shuffle", group: "Campaigns" },
        { id: "retention", label: "Retention / Nurture", icon: "shield-check", group: "Campaigns" }
      ]
    },
    {
      label: "AGENT",
      items: [
        { id: "agent-control", label: "Agent Control", icon: "bot", group: "Agent" }
      ]
    },
    {
      label: "CAMPAIGNS BY SERVICE",
      items: [
        { id: "service-marketing", label: "Service Campaign Overview", icon: "layers-3", group: "Service Marketing" },
        { id: "ftl-marketing", label: "FTL Campaigns", icon: "truck", group: "Campaigns by Service" },
        { id: "ltl-marketing", label: "LTL Campaigns", icon: "package-open", group: "Campaigns by Service" },
        { id: "drayage-marketing", label: "Drayage Campaigns", icon: "container", group: "Campaigns by Service" }
      ]
    },
    {
      label: "CHANNELS",
      items: [
        { id: "email-marketing", label: "Email Marketing", icon: "mail", group: "Channels" },
        { id: "channel-orchestration", label: "Paid / Retargeting / LinkedIn", icon: "radio", group: "Channels" },
        { id: "content-library", label: "Content & Landing Assets", icon: "folder-open", group: "Channels" },
        { id: "automation-playbooks", label: "Automation Playbooks", icon: "workflow", group: "Channels" }
      ]
    },
    {
      label: "ACCOUNTS",
      items: [
        { id: "priority-queue", label: "Account Priority Queue", icon: "list-filter", group: "Accounts" },
        { id: "account-360", label: "Account 360", icon: "contact-round", group: "Accounts" }
      ]
    },
    {
      label: "ANALYTICS",
      items: [
        { id: "campaign-attribution", label: "Campaign Revenue Attribution", icon: "circle-dollar-sign", group: "Analytics" },
        { id: "analytics", label: "Marketing Analytics", icon: "bar-chart-3", group: "Analytics" },
        { id: "account-campaign-reports", label: "Account & Campaign Reports", icon: "file-bar-chart", group: "Analytics" }
      ]
    },
    {
      label: "ADMIN",
      items: [
        { id: "governance", label: "Governance & Approvals", icon: "check-square", group: "Admin" }
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
        <a href="#/campaign-opportunities" class="btn btn-primary" title="AM Campaign Requests" style="border-radius:999px;width:54px;height:54px;padding:0;box-shadow:0 10px 26px rgba(119,184,42,0.4);display:flex;align-items:center;justify-content:center">
          <i data-lucide="radar"></i>
        </a>
      </div>
      <nav class="bottom-nav" id="bottomNav" style="display:none;position:fixed;bottom:0;left:0;right:0;background:#0a0c1e;border-top:1px solid var(--border);padding:8px 6px;justify-content:space-around;z-index:140">
        <a href="#/command-center" class="nav-item" style="flex-direction:column;gap:2px;font-size:9.5px;padding:6px"><i data-lucide="layout-dashboard"></i>Home</a>
        <a href="#/campaign-opportunities" class="nav-item" style="flex-direction:column;gap:2px;font-size:9.5px;padding:6px"><i data-lucide="clipboard-list"></i>AM Requests</a>
        <a href="#/campaign-studio" class="nav-item" style="flex-direction:column;gap:2px;font-size:9.5px;padding:6px"><i data-lucide="palette"></i>Studio</a>
        <a href="#/service-marketing" class="nav-item" style="flex-direction:column;gap:2px;font-size:9.5px;padding:6px"><i data-lucide="layers-3"></i>Services</a>
        <a href="#/campaign-attribution" class="nav-item" style="flex-direction:column;gap:2px;font-size:9.5px;padding:6px"><i data-lucide="circle-dollar-sign"></i>Revenue</a>
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
    mainEl.innerHTML = window.DGL_UI.skeletonKpis(4);
    if (window.lucide) window.lucide.createIcons();

    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          const renderer = window.DGL_MODULE_RENDERERS[id];
          if (renderer) renderer(mainEl);
          else {
            mainEl.innerHTML = window.DGL_UI.emptyState({
              icon: "alert-triangle",
              title: "Módulo no encontrado",
              text: "Selecciona un módulo del menú lateral."
            });
          }
        } catch (err) {
          console.error("DGL Marketing Campaign OS — error renderizando módulo '" + id + "':", err);
          mainEl.innerHTML = window.DGL_UI.emptyState({
            icon: "alert-triangle",
            title: "No se pudo cargar este módulo",
            text: "Ocurrió un error al renderizar '" + mod.label + "'. Revisa la consola del navegador (F12). " + (err && err.message ? err.message : "")
          });
        }
        window.DGL_UI.setActiveNav(id);
        if (window.lucide) window.lucide.createIcons();
      }, 120);
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
      console.error("DGL Marketing Campaign OS — fallo al iniciar:", err);
      if (window.__dglBootFail) window.__dglBootFail("Error al iniciar la aplicación: " + (err && err.message ? err.message : err));
    }
  }
  document.addEventListener("DOMContentLoaded", init);
  global.DGL_APP = { MODULE_GROUPS, ALL_MODULES };
})(window);
