/**
 * DGL Growth OS — isolated shell (preview).
 *
 * Five daily spaces (Inicio, Oportunidades, Campañas, Resultados, AURA) plus a separate
 * Administración area for technical tooling. Every functional view is the EXISTING module
 * renderer (window.DGL_MODULE_RENDERERS) with its commercial logic untouched; this file only
 * replaces navigation, layout and the new Inicio summary. Legacy hashes (#/campaign-studio,
 * #/aura-overview, …) stay canonical so modules that read or set location.hash keep working.
 */
(function (global) {
  "use strict";

  const SPACES = [
    { id: "inicio", label: "Inicio", icon: "home", tabs: [{ id: "inicio", label: "Resumen" }] },
    { id: "oportunidades", label: "Oportunidades", icon: "radar", tabs: [
      { id: "campaign-opportunities", label: "Todas" },
      { id: "quoted-not-booked", label: "QNB" },
      { id: "retention", label: "Retención" },
      { id: "reactivation", label: "Reactivación" },
      { id: "growth", label: "Cross-sell" },
      { id: "service-marketing", label: "Por servicio", group: "Servicio" },
      { id: "ftl-marketing", label: "FTL", group: "Servicio" },
      { id: "ltl-marketing", label: "LTL", group: "Servicio" },
      { id: "drayage-marketing", label: "Drayage", group: "Servicio" },
      { id: "account-campaign-pipeline", label: "Pipeline de cuentas", group: "Cuentas" },
      { id: "priority-queue", label: "Prioridad", group: "Cuentas" }
    ] },
    { id: "campanas", label: "Campañas", icon: "megaphone", tabs: [
      { id: "campaign-studio", label: "Studio" },
      { id: "campaign-execution", label: "Control" },
      { id: "email-marketing", label: "Email" },
      { id: "automation-playbooks", label: "Journeys" },
      { id: "content-library", label: "Contenidos" },
      { id: "acquisition-command-center", label: "Adquisición", group: "Nuevos negocios" },
      { id: "landing-pages", label: "Landing pages", group: "Nuevos negocios" },
      { id: "lead-capture", label: "Captura", group: "Nuevos negocios" },
      { id: "lead-routing", label: "Ruteo", group: "Nuevos negocios" },
      { id: "channel-orchestration", label: "Canales", group: "Nuevos negocios" },
      { id: "paid-media", label: "Paid media", group: "Nuevos negocios" },
      { id: "linkedin-acquisition", label: "LinkedIn", group: "Nuevos negocios" },
      { id: "outbound-acquisition", label: "Outbound", group: "Nuevos negocios" }
    ] },
    { id: "resultados", label: "Resultados", icon: "bar-chart-3", tabs: [
      { id: "account-campaign-reports", label: "Reportes" },
      { id: "analytics", label: "Analítica" },
      { id: "campaign-attribution", label: "Atribución" },
      { id: "acquisition-attribution", label: "Atribución adquisición" }
    ] },
    { id: "aura", label: "AURA", icon: "sparkles", tabs: [{ id: "aura-overview", label: "Command Center" }] }
  ];
  // Technical administration: separated from the daily experience (gear in the top bar).
  const ADMIN = { id: "admin", label: "Administración", icon: "settings", tabs: [
    { id: "admin", label: "Diagnóstico" },
    { id: "governance", label: "Gobernanza" },
    { id: "agent-control", label: "Arquitectura AURA" },
    { id: "command-center", label: "Command Center clásico" },
    { id: "account-360", label: "Account 360" }
  ] };
  const ALL = SPACES.concat([ADMIN]);
  const NEW_VIEWS = { inicio: renderInicio, admin: renderAdmin };
  const LEGACY_IDS = [].concat(...ALL.map(s => s.tabs.map(t => t.id))).filter(id => !NEW_VIEWS[id]);

  const esc = v => String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = n => n == null || !isFinite(Number(n)) ? "—" : Number(n).toLocaleString("es-CO");
  const adapter = () => global.DGL_MARKETING_BACKEND_ADAPTER_V55;
  const connected = () => !!(adapter() && adapter().isConnected && adapter().isConnected());

  function routeId() { const h = (global.location.hash || "").replace(/^#\/?/, "").split(/[?/]/)[0]; return h || "inicio"; }
  function spaceFor(id) { return ALL.find(s => s.tabs.some(t => t.id === id)) || null; }

  function shellHtml() {
    return `
    <div class="gos" id="gos">
      <aside class="gos-rail" aria-label="Navegación principal">
        <a class="gos-brand" href="#/inicio" aria-label="DGL Growth OS — Inicio"><span class="gos-mark">DG</span><span class="gos-brand-text"><strong>DGL</strong><small>Growth OS</small></span></a>
        <nav class="gos-nav">${SPACES.map(s => `<a class="gos-nav-item" data-space="${s.id}" href="#/${s.tabs[0].id}"><i data-lucide="${s.icon}"></i><span>${s.label}</span></a>`).join("")}</nav>
        <div class="gos-rail-foot"><a class="gos-nav-item gos-admin-link" data-space="admin" href="#/admin"><i data-lucide="settings"></i><span>Administración</span></a></div>
      </aside>
      <div class="gos-main">
        <header class="gos-top">
          <div class="gos-title"><span class="gos-eyebrow" id="gosEyebrow"></span><h1 id="gosTitle"></h1></div>
          <div class="gos-top-actions">
            <span class="gos-conn" id="gosConn"></span>
            <a class="gos-btn gos-btn-ghost" href="../index.html" title="Abrir la versión actual de Marketing OS">Versión actual</a>
          </div>
        </header>
        <div class="gos-tabs" id="gosTabs" role="tablist"></div>
        <main class="gos-content main-content" id="mainContent"></main>
      </div>
      <nav class="gos-bottom" aria-label="Navegación móvil">${SPACES.map(s => `<a data-space="${s.id}" href="#/${s.tabs[0].id}"><i data-lucide="${s.icon}"></i><span>${s.label}</span></a>`).join("")}</nav>
    </div>`;
  }

  function tabsHtml(space, id) {
    if (space.tabs.length < 2) return "";
    let lastGroup = null;
    return space.tabs.map(t => {
      const sep = t.group && t.group !== lastGroup ? `<span class="gos-tab-group">${esc(t.group)}</span>` : "";
      lastGroup = t.group || lastGroup;
      return `${sep}<a role="tab" aria-selected="${t.id === id}" class="gos-tab${t.id === id ? " active" : ""}" href="#/${t.id}">${esc(t.label)}</a>`;
    }).join("");
  }

  function connHtml() {
    const st = (adapter() && adapter().getConnectionState && adapter().getConnectionState()) || {};
    if (connected()) return `<span class="gos-pill gos-pill-ok"><i></i>Datos en vivo</span>`;
    if (st.state === "CONNECTING") return `<span class="gos-pill"><i></i>Conectando…</span>`;
    return `<button class="gos-btn gos-btn-primary" data-gos-connect>Conectar datos</button>`;
  }

  function render() {
    let id = routeId();
    let space = spaceFor(id);
    if (!space) { global.location.replace("#/inicio"); return; }
    const tab = space.tabs.find(t => t.id === id);
    document.querySelectorAll("[data-space]").forEach(a => a.classList.toggle("active", a.dataset.space === space.id));
    document.getElementById("gosEyebrow").textContent = space.id === "admin" ? "ADMINISTRACIÓN TÉCNICA" : "DGL GROWTH OS";
    document.getElementById("gosTitle").textContent = space.tabs.length > 1 ? space.label + " · " + tab.label : space.label;
    document.getElementById("gosTabs").innerHTML = tabsHtml(space, id);
    document.getElementById("gosTabs").hidden = space.tabs.length < 2;
    document.getElementById("gosConn").innerHTML = connHtml();
    const mount = document.getElementById("mainContent");
    mount.dataset.view = id;
    mount.innerHTML = `<div class="gos-skeleton" aria-busy="true"><div></div><div></div><div></div></div>`;
    const run = NEW_VIEWS[id] || (global.DGL_MODULE_RENDERERS || {})[id];
    try {
      const r = run ? run(mount) : null;
      if (!run) mount.innerHTML = emptyState("Vista no disponible", "Este módulo no está cargado en esta vista previa.");
      Promise.resolve(r).catch(err => { mount.innerHTML = emptyState("No se pudo cargar esta vista", err && err.message); }).then(icons);
    } catch (err) { mount.innerHTML = emptyState("No se pudo cargar esta vista", err && err.message); }
    icons();
  }
  function icons() { if (global.lucide && global.lucide.createIcons) global.lucide.createIcons(); }
  function emptyState(title, text) { return `<div class="gos-empty"><i data-lucide="circle-alert"></i><h3>${esc(title)}</h3><p>${esc(text || "")}</p></div>`; }

  // ---- Inicio: daily summary built ONLY from server-computed data (no duplicated business math)
  async function renderInicio(mount) {
    if (!connected()) {
      mount.innerHTML = `<section class="gos-hero"><div><span class="gos-eyebrow">BIENVENIDO</span><h2>Tu día de crecimiento comercial en un solo lugar.</h2><p>Oportunidades detectadas, campañas gobernadas, resultados y AURA. Conecta los datos privados para ver la información real.</p><div class="gos-hero-actions"><button class="gos-btn gos-btn-primary" data-gos-connect>Conectar datos</button><a class="gos-btn gos-btn-ghost" href="#/campaign-studio">Abrir Campaign Studio</a></div></div></section>
        <section class="gos-grid gos-grid-4">${["Oportunidades", "Campañas", "Resultados", "AURA"].map(t => `<div class="gos-card gos-card-muted"><span class="gos-eyebrow">${t}</span><strong>—</strong><small>Sin conexión</small></div>`).join("")}</section>`;
      return;
    }
    mount.innerHTML = `<div class="gos-skeleton" aria-busy="true"><div></div><div></div><div></div></div>`;
    const ad = adapter();
    const [opp, cc] = await Promise.all([ad.v6Opportunities ? ad.v6Opportunities().catch(() => null) : null, ad.v6AuraCommandCenter ? ad.v6AuraCommandCenter().catch(() => null) : null]);
    const summary = (opp && opp.summary) || {}, groups = (opp && opp.groups) || [];
    const byType = {}; groups.forEach(g => { const k = String(g.opportunityType || "Otro"); byType[k] = (byType[k] || 0) + Number(g.eligibleAccounts || 0); });
    const agent = (cc && cc.agent) || {}, status = agent.status || {}, perf = (cc && cc.performance) || {};
    const scopes = Object.values(perf.scopes || {}).filter(s => s.allTime && s.allTime.sent && !/(^|[^A-Z0-9])(QA|TEST)([^A-Z0-9]|$)/i.test(s.campaignId)).sort((a, b) => String(b.lastSentAt || "").localeCompare(String(a.lastSentAt || "")));
    const lead = scopes[0];
    const approvals = agent.waitingApproval || [];
    mount.innerHTML = `
      <section class="gos-grid gos-grid-4">
        <a class="gos-card" href="#/campaign-opportunities"><span class="gos-eyebrow">Oportunidades</span><strong>${fmt(summary.eligibleAccounts)}</strong><small>cuentas elegibles · ${fmt(summary.totalSignals)} señales</small></a>
        <a class="gos-card" href="#/aura-overview"><span class="gos-eyebrow">Por aprobar</span><strong>${fmt(approvals.length)}</strong><small>campañas preparadas por AURA</small></a>
        <a class="gos-card" href="#/account-campaign-reports"><span class="gos-eyebrow">Última campaña</span><strong>${lead ? fmt(lead.currentRun && lead.currentRun.sent) : "—"}</strong><small>${lead ? esc(lead.campaignId) + " · corrida actual" : "Sin envíos recientes"}</small></a>
        <a class="gos-card" href="#/aura-overview"><span class="gos-eyebrow">AURA</span><strong class="gos-status ${status.runtime === "ACTIVE" ? "ok" : "warn"}">${status.runtime === "ACTIVE" ? "Activa" : "Pausada"}</strong><small>${status.lastRun ? "Último ciclo " + esc(String(status.lastRun.finishedAt || status.lastRun.startedAt || "").slice(0, 16).replace("T", " ")) : "Sin ciclos registrados"}</small></a>
      </section>
      <section class="gos-grid gos-grid-2">
        <div class="gos-panel"><div class="gos-panel-head"><h3>Hoy, AURA recomienda</h3><a href="#/aura-overview">Ver AURA</a></div>
          ${approvals.length ? `<ul class="gos-list">${approvals.slice(0, 5).map(t => `<li><div><strong>${esc(t.title)}</strong><small>${esc(t.scope)} · requiere tu aprobación</small></div><a class="gos-btn gos-btn-primary gos-btn-sm" href="#/aura-overview">Revisar</a></li>`).join("")}</ul>` : `<p class="gos-muted">No hay campañas esperando aprobación.</p>`}
        </div>
        <div class="gos-panel"><div class="gos-panel-head"><h3>Oportunidades por familia</h3><a href="#/campaign-opportunities">Ver todas</a></div>
          ${Object.keys(byType).length ? `<ul class="gos-bars">${Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => { const max = Math.max(...Object.values(byType)) || 1; return `<li><span>${esc(k)}</span><div><i style="width:${Math.round(v / max * 100)}%"></i></div><b>${fmt(v)}</b></li>`; }).join("")}</ul>` : `<p class="gos-muted">Sin oportunidades detectadas.</p>`}
        </div>
      </section>
      ${lead ? `<section class="gos-panel"><div class="gos-panel-head"><h3>${esc(lead.campaignId)}</h3><a href="#/account-campaign-reports">Ver resultados</a></div>
        <div class="gos-grid gos-grid-4 gos-kpis">
          <div><span>Corrida actual</span><strong>${fmt(lead.currentRun && lead.currentRun.sent)}</strong></div>
          <div><span>Histórico (otras familias)</span><strong>${fmt(lead.historical && lead.historical.sent)}</strong></div>
          <div><span>Total</span><strong>${fmt(lead.allTime && lead.allTime.sent)}</strong></div>
          <div><span>Respuestas</span><strong>${fmt(lead.allTime && lead.allTime.replied)}</strong></div>
        </div><p class="gos-muted">Cifras calculadas por el backend (Email Performance). Aperturas y clics solo cuentan en envíos con tracking.</p></section>` : ""}
      <section class="gos-quick"><a class="gos-btn gos-btn-ghost" href="#/campaign-studio"><i data-lucide="palette"></i>Crear en Studio</a><a class="gos-btn gos-btn-ghost" href="#/quoted-not-booked"><i data-lucide="file-warning"></i>Revisar QNB</a><a class="gos-btn gos-btn-ghost" href="#/aura-overview"><i data-lucide="sparkles"></i>Pedir algo a AURA</a></section>`;
  }

  // ---- Administración: technical diagnostics kept out of the daily experience.
  function renderAdmin(mount) {
    const ad = adapter(), st = (ad && ad.getConnectionState && ad.getConnectionState()) || {}, diag = global.DGL_BACKEND_DIAGNOSTIC || {}, m = (ad && ad.getRequestMetrics && ad.getRequestMetrics()) || {};
    const rows = [["Estado de conexión", st.state || "—"], ["Modo", st.mode || "—"], ["Requests en esta sesión", m.requests], ["Lecturas desde caché", m.cacheHits], ["Requests deduplicados", m.dedupeHits]].concat(Object.keys(diag).map(k => [k, diag[k]]));
    mount.innerHTML = `<section class="gos-panel"><div class="gos-panel-head"><h3>Diagnóstico de la plataforma</h3></div>
      <table class="gos-table"><tbody>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v == null || v === "" ? "—" : v)}</td></tr>`).join("")}</tbody></table>
      <p class="gos-muted">Solo lectura. La configuración de backend, triggers y Script Properties se gestiona en Apps Script; este espacio no ejecuta cambios.</p></section>
      ${(m.last || []).length ? `<section class="gos-panel"><div class="gos-panel-head"><h3>Últimas llamadas al backend</h3></div><table class="gos-table"><thead><tr><th>Acción</th><th>ms</th><th>OK</th></tr></thead><tbody>${m.last.map(r => `<tr><td>${esc(r.action)}</td><td>${fmt(r.ms)}</td><td>${r.ok ? "Sí" : "No"}</td></tr>`).join("")}</tbody></table></section>` : ""}`;
  }

  function init() {
    try {
      document.getElementById("app").innerHTML = shellHtml();
      global.addEventListener("hashchange", render);
      global.addEventListener("dgl:v55-backend-change", () => { const c = document.getElementById("gosConn"); if (c) c.innerHTML = connHtml(); if (routeId() === "inicio" || routeId() === "admin") render(); icons(); });
      document.addEventListener("click", async e => {
        if (e.target.closest("[data-gos-connect]")) { try { await adapter().connect(); } catch (_) {} render(); }
      });
      if (!global.location.hash) global.location.replace("#/inicio");
      render();
      if (global.__dglMarkReady) global.__dglMarkReady();
    } catch (err) {
      if (global.__dglBootFail) global.__dglBootFail("Error al iniciar Growth OS: " + (err && err.message ? err.message : err));
    }
  }
  global.DGL_GROWTH_OS = { SPACES, ADMIN, LEGACY_IDS, spaceFor, routeId };
  document.addEventListener("DOMContentLoaded", init);
})(window);
