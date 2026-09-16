/**
 * AURA Overview — real-data dashboard for the Existing Account Growth pipeline
 * (NOVA/Salesforce -> AM Intelligence -> AURA -> Marketing OS).
 *
 * Read-only by design: this page only ever calls the AURA reporting endpoints
 * (v6AuraRetentionDashboard/v6AuraCampanaAAudit/v6AuraCampanaAMatchReport/
 * v6AuraCampanaAStoppedBreakdown/v6AuraExecutionReport), never a function that builds a
 * queue, dispatches, or sends a real email. Every number shown here is real Data Hub data
 * once connected -- there is no local sample/demo data path for this module.
 */
(function (global) {
  "use strict";

  const adapter = () => global.DGL_MARKETING_BACKEND_ADAPTER_V55;
  let state = { loading: false, error: "", retention: null, campanaA: null, matchReport: null, stoppedBreakdown: null, execReport: null };

  function fmt(n) { return Number(n || 0).toLocaleString("en-US"); }
  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function statusBadge(status) {
    const s = String(status || "").toUpperCase();
    const tone = s.indexOf("SEND PROVIDER") >= 0 ? "warn" : s === "ACTIVE" || s === "SENDING" ? "live" : s.indexOf("READY") >= 0 || s === "QUEUED" ? "ready" : "idle";
    return `<span class="aura-badge aura-badge-${tone}">${esc(status || "—")}</span>`;
  }

  function kpi(icon, label, value, foot) {
    return global.DGL_UI && global.DGL_UI.kpiCard
      ? global.DGL_UI.kpiCard({ icon, label, value, foot })
      : `<div class="card kpi-card"><div class="kpi-value">${esc(value)}</div><div class="kpi-label">${esc(label)}</div></div>`;
  }

  function languageRow(byLanguage) {
    const bl = byLanguage || {};
    const total = (Number(bl.ES) || 0) + (Number(bl.EN) || 0) + (Number(bl.PT) || 0);
    const pct = (n) => (total ? Math.round((Number(n || 0) / total) * 100) : 0);
    return `
    <div class="aura-lang-bar" role="img" aria-label="Language distribution">
      <div class="aura-lang-seg aura-lang-es" style="width:${pct(bl.ES)}%" title="ES ${fmt(bl.ES)}"></div>
      <div class="aura-lang-seg aura-lang-en" style="width:${pct(bl.EN)}%" title="EN ${fmt(bl.EN)}"></div>
      <div class="aura-lang-seg aura-lang-pt" style="width:${pct(bl.PT)}%" title="PT ${fmt(bl.PT)}"></div>
    </div>
    <div class="aura-lang-legend">
      <span><i class="aura-dot aura-dot-es"></i>ES ${fmt(bl.ES)}</span>
      <span><i class="aura-dot aura-dot-en"></i>EN ${fmt(bl.EN)}</span>
      <span><i class="aura-dot aura-dot-pt"></i>PT ${fmt(bl.PT)}</span>
    </div>`;
  }

  function campaignsTable(records) {
    if (!records || !records.length) return `<div class="card card-pad">No hay campañas AURA reportadas todavía.</div>`;
    const rows = records.map((r) => `
      <tr>
        <td>${esc(r.campaignFamily)}</td>
        <td>${esc(r.owner)}</td>
        <td>${esc(r.service)}</td>
        <td>${statusBadge(r.status)}</td>
        <td>${fmt(r.recipients)}</td>
        <td>${fmt(r.sent)}</td>
        <td>${fmt(r.replies)}</td>
        <td>${fmt(r.rfqs)}</td>
        <td>${fmt(r.quotes)}</td>
        <td>${fmt(r.loads)}</td>
        <td>${esc(r.updatedAt || "").slice(0, 16).replace("T", " ")}</td>
      </tr>`).join("");
    return `
    <div class="card card-pad" style="overflow-x:auto">
      <table class="data-table">
        <thead><tr><th>Familia</th><th>Owner</th><th>Servicio</th><th>Estado</th><th>Recipients</th><th>Sent</th><th>Responses</th><th>RFQs</th><th>Quotes</th><th>Loads</th><th>Actualizado</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  function unmatchedList(title, items, keyField) {
    if (!items || !items.length) return `<div class="aura-empty">Ninguno.</div>`;
    return `<ul class="aura-reason-list">${items.slice(0, 25).map((i) => `<li><strong>${esc(i[keyField])}</strong> — ${esc(i.reason)}</li>`).join("")}</ul>${items.length > 25 ? `<div class="aura-more">+${items.length - 25} más</div>` : ""}`;
  }

  function stoppedBreakdownCard(breakdown) {
    if (!breakdown) return "";
    const stageRows = Object.entries(breakdown.byStage || {}).map(([k, v]) => `<li><span>${esc(k)}</span><strong>${fmt(v)}</strong></li>`).join("");
    const overrideRows = Object.entries(breakdown.byOverrideReason || {}).map(([k, v]) => `<li><span>${esc(k)}</span><strong>${fmt(v)}</strong></li>`).join("");
    return `
    <div class="card card-pad">
      <h3 class="aura-subhead">STOPPED · desglose real</h3>
      <p class="text-secondary">Total detenidos: <strong>${fmt(breakdown.totalStopped)}</strong> · Anulados por respuesta histórica de otra campaña (&gt;90 días): <strong>${fmt(breakdown.totalOverridden)}</strong></p>
      <div class="aura-two-col">
        <div><div class="aura-mini-label">Por stage</div><ul class="aura-kv-list">${stageRows || "<li>—</li>"}</ul></div>
        <div><div class="aura-mini-label">Por motivo de override</div><ul class="aura-kv-list">${overrideRows || "<li>—</li>"}</ul></div>
      </div>
    </div>`;
  }

  function matchReportCard(report) {
    if (!report) return "";
    return `
    <div class="card card-pad">
      <h3 class="aura-subhead">Matching cuentas / contactos · Campaña A</h3>
      <div class="kpi-grid" style="margin-bottom:14px">
        ${kpi("building-2", "Cuentas fuente", report.sourceAccountCount)}
        ${kpi("check-circle-2", "Cuentas con match", report.accountsMatched)}
        ${kpi("alert-triangle", "Cuentas sin match", report.accountsUnmatched)}
        ${kpi("users", "Contactos con email en la pestaña", report.sourceContactCount)}
        ${kpi("user-check", "Contactos con match", report.contactsMatched)}
        ${kpi("user-x", "Contactos sin match", report.contactsUnmatched)}
      </div>
      <div class="aura-two-col">
        <div><div class="aura-mini-label">Cuentas sin match (motivo)</div>${unmatchedList("accounts", report.unmatchedAccounts, "accountName")}</div>
        <div><div class="aura-mini-label">Contactos sin match (motivo)</div>${unmatchedList("contacts", report.unmatchedContacts, "email")}</div>
      </div>
    </div>`;
  }

  function paint(mount) {
    if (!mount) return;
    const connected = adapter() && adapter().isConnected && adapter().isConnected();
    const connectionState = (adapter() && adapter().getConnectionState && adapter().getConnectionState()) || {};
    const c = state.campanaA || {};
    const r = state.retention || {};

    mount.innerHTML = `
    <div class="page-head">
      <div>
        <div class="eyebrow">AURA · EXISTING ACCOUNT GROWTH</div>
        <h2>AURA Overview</h2>
        <p class="lede">NOVA/Salesforce → AM Intelligence → AURA → Marketing OS. Datos reales del Data Hub — sin cifras de muestra.</p>
      </div>
      <div class="page-head-actions">
        <span class="sample-flag">${connected ? "PRIVATE BACKEND / LIVE" : connectionState.state === "CONNECTING" ? "CONNECTING" : "PRIVATE BACKEND REQUIRED"}</span>
        ${connected
        ? '<button class="btn btn-secondary" data-aura-refresh>REFRESH</button>'
        : `<button class="btn btn-primary" data-aura-connect ${connectionState.state === "CONNECTING" ? "disabled" : ""}>${connectionState.state === "CONNECTING" ? "CONNECTING" : "CONNECT PRIVATE BACKEND"}</button>`}
      </div>
    </div>

    ${!connected ? `<div class="card card-pad"><strong>${state.loading ? "Cargando…" : state.error || "Conecta el backend privado para ver datos reales de AURA."}</strong></div>` : `

    <div class="kpi-grid">
      ${kpi("git-branch", "Run ID (última corrida Retention)", r.runId || "—")}
      ${kpi("calendar-clock", "Última ejecución", (r.lastRun || "—").slice(0, 16).replace("T", " "))}
      ${kpi("radar", "Detectadas (Retention pilot)", r.detected)}
      ${kpi("check-circle", "Elegibles", r.eligible)}
      ${kpi("eye", "Review Required", r.reviewRequired)}
      ${kpi("send", "Campaign Ready", r.campaignReady)}
    </div>

    <h3 class="aura-subhead">Campaña A · HA Prioritaria</h3>
    <div class="kpi-grid">
      ${kpi("building-2", "Source accounts", c.sourceAccountCount)}
      ${kpi("users", "Jobs (Campaña A)", c.jobsForCampaignA)}
      ${kpi("mail", "Queued (DRY_RUN)", (c.byStatusForCampaignA || {}).DRY_RUN)}
      ${kpi("send", "Sent real", c.realSendsDetected)}
      ${kpi("shield-off", "Stopped", (c.byStatusForCampaignA || {}).STOPPED)}
      ${kpi("badge-check", "Estado fuente", c.sourceStatus === "SOURCE_OK" ? "OK" : (c.sourceStatus || "—"))}
    </div>
    <div class="card card-pad">
      <h3 class="aura-subhead" style="margin-top:0">Distribución de idioma (ES / EN / PT)</h3>
      ${languageRow(c.byLanguage)}
    </div>

    ${stoppedBreakdownCard(c.stoppedBreakdown)}
    ${matchReportCard(c.matchReport)}

    <h3 class="aura-subhead">Campañas AURA (todas las familias · datos reales de MKT_AURA_EXECUTION_REPORT)</h3>
    ${campaignsTable(((state.execReport || {}).records) || [])}

    <div class="card card-pad">
      <strong>Provider de envío:</strong> DRY_RUN por defecto en todo el sistema. Ningún envío real ocurre desde este dashboard — esta página es solo de lectura.
      Landing Pages: ver la sección <a href="#/landing-pages">Landing Pages</a> del menú.
    </div>
    `}`;

    global.lucide && global.lucide.createIcons && global.lucide.createIcons();
  }

  async function refresh(mount) {
    if (state.loading || !adapter() || !adapter().isConnected()) return;
    state.loading = true; state.error = ""; paint(mount);
    try {
      const [retention, campanaA, matchReport, stoppedBreakdown, execReport] = await Promise.all([
        adapter().v6AuraRetentionDashboard ? adapter().v6AuraRetentionDashboard() : null,
        adapter().v6AuraCampanaAAudit ? adapter().v6AuraCampanaAAudit() : null,
        adapter().v6AuraCampanaAMatchReport ? adapter().v6AuraCampanaAMatchReport() : null,
        adapter().v6AuraCampanaAStoppedBreakdown ? adapter().v6AuraCampanaAStoppedBreakdown() : null,
        adapter().v6AuraExecutionReport ? adapter().v6AuraExecutionReport() : null
      ]);
      state.retention = retention || {};
      state.campanaA = Object.assign({}, campanaA || {}, { matchReport: matchReport || null, stoppedBreakdown: stoppedBreakdown || null });
      state.execReport = execReport || {};
    } catch (error) {
      state.error = "No se pudo cargar AURA: " + (error && error.message || error);
    } finally {
      state.loading = false; paint(mount);
    }
  }

  let currentMount = null;
  async function render(mount) {
    currentMount = mount;
    paint(mount);
    if (adapter() && adapter().isConnected()) await refresh(mount);
  }

  global.document && global.document.addEventListener("click", async (event) => {
    if (event.target.closest("[data-aura-connect]")) {
      try { await adapter().connect(); if (adapter().isConnected()) await refresh(currentMount); } catch (error) { state.error = error.message; paint(currentMount); }
    } else if (event.target.closest("[data-aura-refresh]")) {
      await refresh(currentMount);
    }
  });
  global.addEventListener && global.addEventListener("dgl:v55-backend-change", (event) => {
    if (!global.location || !global.location.hash.includes("aura-overview")) return;
    if ((event.detail || {}).state === "PRIVATE_BACKEND") refresh(currentMount); else paint(currentMount);
  });

  global.DGL_MODULE_RENDERERS = global.DGL_MODULE_RENDERERS || {};
  global.DGL_MODULE_RENDERERS["aura-overview"] = render;
})(window);
