/**
 * DGL Marketing OS — App Shell / Router
 * Campaign Experience V1
 *
 * Canonical separation:
 * 1) Existing Account Growth: NOVA/Salesforce -> AM Intelligence -> AURA -> Marketing OS
 * 2) New Business Acquisition: Traffic/Prospecting -> Channels -> Lead Capture -> Salesforce/New Business
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
      label: "EXISTING ACCOUNT GROWTH",
      items: [
        { id: "campaign-opportunities", label: "Campaign Opportunities", icon: "radar", group: "Existing Account Growth" },
        { id: "retention", label: "Retention / Nurture", icon: "shield-check", group: "Existing Account Growth" },
        { id: "reactivation", label: "Reactivation Campaigns", icon: "refresh-cw", group: "Existing Account Growth" },
        { id: "quoted-not-booked", label: "Quoted Not Booked", icon: "file-warning", group: "Existing Account Growth" },
        { id: "growth", label: "Cross-Sell Campaigns", icon: "shuffle", group: "Existing Account Growth" }
      ]
    },
    {
      label: "CAMPAIGN OPERATIONS",
      items: [
        { id: "campaign-execution", label: "Campaign Control", icon: "megaphone", group: "Campaign Operations" },
        { id: "campaign-studio", label: "Campaign Studio", icon: "palette", group: "Campaign Operations" },
        { id: "email-marketing", label: "Customer Email Campaigns", icon: "mail", group: "Campaign Operations" }
      ]
    },
    {
      label: "NEW BUSINESS ACQUISITION",
      items: [
        { id: "acquisition-command-center", label: "Acquisition Command Center", icon: "goal", group: "New Business Acquisition" },
        { id: "landing-pages", label: "Landing Pages", icon: "panels-top-left", group: "New Business Acquisition" },
        { id: "channel-orchestration", label: "Channel Orchestration", icon: "radio", group: "New Business Acquisition" },
        { id: "paid-media", label: "Paid Media", icon: "badge-dollar-sign", group: "New Business Acquisition" },
        { id: "linkedin-acquisition", label: "LinkedIn Acquisition", icon: "linkedin", group: "New Business Acquisition" },
        { id: "outbound-acquisition", label: "Outbound / Lead Nurture", icon: "send", group: "New Business Acquisition" },
        { id: "lead-capture", label: "Lead Capture", icon: "inbox", group: "New Business Acquisition" },
        { id: "lead-routing", label: "Lead Routing", icon: "route", group: "New Business Acquisition" },
        { id: "acquisition-attribution", label: "Acquisition Attribution", icon: "chart-no-axes-combined", group: "New Business Acquisition" },
        { id: "automation-playbooks", label: "Acquisition Journeys", icon: "workflow", group: "New Business Acquisition" }
      ]
    },
    {
      label: "CONTENT",
      items: [
        { id: "content-library", label: "Content & Asset Library", icon: "folder-open", group: "Content" }
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
      label: "ACCOUNTS",
      items: [
        { id: "account-campaign-pipeline", label: "Account Campaign Pipeline", icon: "git-branch", group: "Accounts" },
        { id: "priority-queue", label: "Account Priority Queue", icon: "list-filter", group: "Accounts" },
        { id: "account-360", label: "Account 360", icon: "contact-round", group: "Accounts" }
      ]
    },
    {
      label: "ANALYTICS",
      items: [
        { id: "campaign-attribution", label: "Existing Account Attribution", icon: "circle-dollar-sign", group: "Analytics" },
        { id: "analytics", label: "Marketing Analytics", icon: "bar-chart-3", group: "Analytics" },
        { id: "account-campaign-reports", label: "Account & Campaign Reports", icon: "file-bar-chart", group: "Analytics" }
      ]
    },
    {
      label: "FUTURE ARCHITECTURE",
      items: [
        { id: "agent-control", label: "AURA Control · Future", icon: "bot", group: "Future Architecture" }
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
        <a href="#/campaign-opportunities" class="btn btn-primary" title="Campaign Opportunities" style="border-radius:999px;width:54px;height:54px;padding:0;box-shadow:0 10px 26px rgba(119,184,42,0.4);display:flex;align-items:center;justify-content:center">
          <i data-lucide="radar"></i>
        </a>
      </div>
      <nav class="bottom-nav" id="bottomNav" style="display:none;position:fixed;bottom:0;left:0;right:0;background:#0a0c1e;border-top:1px solid var(--border);padding:8px 6px;justify-content:space-around;z-index:140">
        <a href="#/command-center" class="nav-item" style="flex-direction:column;gap:2px;font-size:9.5px;padding:6px"><i data-lucide="layout-dashboard"></i>Home</a>
        <a href="#/campaign-opportunities" class="nav-item" style="flex-direction:column;gap:2px;font-size:9.5px;padding:6px"><i data-lucide="radar"></i>Accounts</a>
        <a href="#/campaign-studio" class="nav-item" style="flex-direction:column;gap:2px;font-size:9.5px;padding:6px"><i data-lucide="palette"></i>Studio</a>
        <a href="#/acquisition-command-center" class="nav-item" style="flex-direction:column;gap:2px;font-size:9.5px;padding:6px"><i data-lucide="goal"></i>Leads</a>
        <a href="#/landing-pages" class="nav-item" style="flex-direction:column;gap:2px;font-size:9.5px;padding:6px"><i data-lucide="panels-top-left"></i>Landing</a>
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
          console.error("DGL Marketing OS — error renderizando módulo '" + id + "':", err);
          mainEl.innerHTML = window.DGL_UI.emptyState({
            icon: "alert-triangle",
            title: "No se pudo cargar este módulo",
            text: "Ocurrió un error al renderizar '" + mod.label + "'. " + (err && err.message ? err.message : "")
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
      console.error("DGL Marketing OS — fallo al iniciar:", err);
      if (window.__dglBootFail) window.__dglBootFail("Error al iniciar la aplicación: " + (err && err.message ? err.message : err));
    }
  }
  document.addEventListener("DOMContentLoaded", init);
  global.DGL_APP = { MODULE_GROUPS, ALL_MODULES };
})(window);
