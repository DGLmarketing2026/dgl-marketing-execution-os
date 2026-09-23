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
  let state = { loading: false, error: "", retention: null, campanaA: null, matchReport: null, stoppedBreakdown: null, execReport: null, runSummary: null, performance: null, performanceError: "" };

  function fmt(n) { return n == null || !Number.isFinite(Number(n)) ? "N/A" : Number(n).toLocaleString("en-US"); }
  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  const perfFilters = { metric: '', search: '', campaignId: '', campaignFamily: '', sendStatus: '', language: '', from: '', to: '' };
  const perfColumns = ['jobId','company','contactName','email','campaignId','campaignFamily','service','language','amOwner','sendStatus','sentAt','failedAt','bounceStatus','bounceReason','bounceAt','replied','replyAt','opened','openAt','clicked','clickAt'];
  function metricMatches(r, metric) {
    return !metric || ({sent:!!r.sentAt || r.sendStatus==='SENT',failed:!!r.failedAt || r.sendStatus==='FAILED',bounced:!!r.bounceStatus,replied:r.replied===true,opened:r.opened===true,clicked:r.clicked===true})[metric];
  }
  function filterPerformance(rows, filters) {
    return rows.filter(r => {
      if (!metricMatches(r,filters.metric)) return false;
      if (!['company','contactName','email'].some(k=>String(r[k]||'').toLowerCase().includes(String(filters.search||'').toLowerCase()))) return false;
      if (['campaignId','campaignFamily','sendStatus','language'].some(k=>filters[k] && r[k]!==filters[k])) return false;
      const dates=[r.sentAt,r.failedAt,r.replyAt,r.bounceAt,r.openAt,r.clickAt].filter(Boolean).map(d=>String(d).slice(0,10));
      return (!filters.from&&!filters.to)||dates.some(d=>(!filters.from||d>=filters.from)&&(!filters.to||d<=filters.to));
    });
  }
  function performanceCsv(rows) {
    const cell = v => { let s=v==null?'NOT_TRACKED':String(v); if(/^[=+@\-\t\r]/.test(s))s="'"+s; return '"'+s.replace(/"/g,'""')+'"'; };
    return '\uFEFF'+[perfColumns.map(cell).join(','),...rows.map(r=>perfColumns.map(k=>cell(r[k])).join(','))].join('\r\n');
  }
  function performanceSection() {
    const data=state.performance;
    if(!data)return `<section class="card card-pad"><h3>Email Performance</h3><p>${esc(state.performanceError||'Loading recipient report…')}</p></section>`;
    const opts = k => [...new Set(data.rows.map(r=>r[k]).filter(Boolean))].sort().map(v=>`<option ${perfFilters[k]===v?'selected':''} value="${esc(v).replace(/"/g,'&quot;')}">${esc(v)}</option>`).join('');
    return `<section class="aura-performance card card-pad"><h3>Email Performance</h3>
      <div class="aura-performance-kpis">${['sent','failed','bounced','replied','opened','clicked'].map(k=>`<button type="button" data-perf-kpi="${k}" aria-pressed="${perfFilters.metric===k}"><span>${k.toUpperCase()}</span><strong>${fmt(data.summary[k])}</strong><small>${data.summary[k]==null?'NOT TRACKED':'MEASURED'}</small></button>`).join('')}</div>
      <div class="aura-performance-filters"><label>Search company/contact/email<input data-perf-filter="search" type="search" value="${esc(perfFilters.search).replace(/"/g,'&quot;')}"></label>
      ${[['campaignId','Campaign'],['campaignFamily','Family'],['sendStatus','Status'],['language','Language']].map(([k,label])=>`<label>${label}<select data-perf-filter="${k}"><option value="">All</option>${opts(k)}</select></label>`).join('')}
      ${['from','to'].map(k=>`<label>${k==='from'?'From':'To'} (UTC)<input type="date" data-perf-filter="${k}" value="${perfFilters[k]}"></label>`).join('')}
      <button data-perf-reset>Clear filters</button><button data-perf-download>DOWNLOAD CSV</button></div>
      <p>Dates match sent, failed, reply, bounce, open or click time. One row per recipient send job. SENT does not mean DELIVERED.</p>
      <div data-perf-detail></div></section>`;
  }
  function bindPerformance(mount) {
    if(!state.performance)return;
    const host=mount.querySelector&&mount.querySelector('.aura-performance');if(!host)return;
    function update(){
      const rows=filterPerformance(state.performance.rows,perfFilters);
      host.querySelector('[data-perf-detail]').innerHTML=`<p aria-live="polite">${rows.length} recipient rows</p><div class="aura-performance-scroll"><table class="data-table"><thead><tr>${perfColumns.map(k=>`<th>${esc(k)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${perfColumns.map(k=>`<td>${r[k]==null?'N/A / NOT TRACKED':esc(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      host.querySelectorAll('[data-perf-kpi]').forEach(b=>b.setAttribute('aria-pressed',String(perfFilters.metric===b.dataset.perfKpi)));
    }
    host.querySelectorAll('[data-perf-kpi]').forEach(b=>b.onclick=()=>{perfFilters.metric=perfFilters.metric===b.dataset.perfKpi?'':b.dataset.perfKpi;update();});
    host.querySelectorAll('[data-perf-filter]').forEach(input=>input.oninput=()=>{perfFilters[input.dataset.perfFilter]=input.value;update();});
    host.querySelector('[data-perf-reset]').onclick=()=>{Object.keys(perfFilters).forEach(k=>perfFilters[k]='');paint(mount);};
    host.querySelector('[data-perf-download]').onclick=()=>{
      const blob=new Blob([performanceCsv(filterPerformance(state.performance.rows,perfFilters))],{type:'text/csv;charset=utf-8'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='aura-email-performance.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };update();
  }
  global.DGL_AURA_PERFORMANCE = {filter:filterPerformance,csv:performanceCsv};

  function statusBadge(status) {
    const s = String(status || "").toUpperCase();
    const tone = s.indexOf("SEND PROVIDER") >= 0 ? "warn" : s === "ACTIVE" || s === "SENDING" ? "live" : s.indexOf("READY") >= 0 || s === "QUEUED" ? "ready" : "idle";
    return `<span class="aura-badge aura-badge-${tone}">${esc(status || "—")}</span>`;
  }

  function kpi(icon, label, value, foot) {
    if(value == null || (typeof value === "number" && !Number.isFinite(value))) value = "N/A";
    return global.DGL_UI && global.DGL_UI.kpiCard
      ? global.DGL_UI.kpiCard({ icon, label, value, foot })
      : `<div class="card kpi-card"><div class="kpi-value">${esc(value)}</div><div class="kpi-label">${esc(label)}</div></div>`;
  }

  function languageRow(byLanguage) {
    const bl = byLanguage || {};
    const finite = n => Number.isFinite(Number(n)) ? Number(n) : 0;
    const total = finite(bl.ES) + finite(bl.EN) + finite(bl.PT);
    const pct = (n) => (total && Number.isFinite(total) ? Math.round((finite(n) / total) * 100) : 0);
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

  // Pass 18: the Campana A tab is now the PRIMARY recipient source -- a contact this report
  // calls "sin match" (not yet synced into MKT_CONTACTS_SECURE/NOVA) is still a real, governed
  // recipient (recipientSource CAMPANA_A_SOURCE), never excluded from the campaign for that
  // reason alone. This card is explicitly framed as a NOVA-sync-coverage diagnostic, not an
  // eligibility gate -- see recipientSourceCard below for actual campaign-inclusion counts.
  function matchReportCard(report) {
    if (!report) return "";
    return `
    <div class="card card-pad">
      <h3 class="aura-subhead">Cobertura de sincronización NOVA · Campaña A (diagnóstico, no filtra destinatarios)</h3>
      <p class="text-secondary">"Sin match" aquí significa que la cuenta/contacto aún no está sincronizado en MKT_CONTACTS_SECURE — no significa excluido de la campaña. Ver "Origen de destinatarios" abajo para el conteo real de inclusión.</p>
      <div class="kpi-grid" style="margin-bottom:14px">
        ${kpi("building-2", "Cuentas fuente", report.sourceAccountCount)}
        ${kpi("check-circle-2", "Cuentas con match NOVA", report.accountsMatched)}
        ${kpi("alert-triangle", "Cuentas sin match NOVA", report.accountsUnmatched)}
        ${kpi("users", "Contactos con email en la pestaña", report.sourceContactCount)}
        ${kpi("user-check", "Contactos con match NOVA", report.contactsMatched)}
        ${kpi("user-x", "Contactos sin match NOVA", report.contactsUnmatched)}
      </div>
      <div class="aura-two-col">
        <div><div class="aura-mini-label">Cuentas sin match NOVA (motivo)</div>${unmatchedList("accounts", report.unmatchedAccounts, "accountName")}</div>
        <div><div class="aura-mini-label">Contactos sin match NOVA (motivo)</div>${unmatchedList("contacts", report.unmatchedContacts, "email")}</div>
      </div>
    </div>`;
  }

  // Pass 18: real, after-the-fact campaign-inclusion breakdown by recipientSource -- MERGED (tab
  // email matched a real MKT_CONTACTS_SECURE record), CAMPANA_A_SOURCE (present on the tab only --
  // the required CONTACT_SOURCE_ONLY case, still a full recipient), CONTACTS_SECURE (already
  // known in MKT_CONTACTS_SECURE, not listed with an email on this tab extract).
  function recipientSourceCard(byRecipientSource) {
    if (!byRecipientSource) return "";
    const b = byRecipientSource;
    const total = (Number(b.MERGED) || 0) + (Number(b.CAMPANA_A_SOURCE) || 0) + (Number(b.CONTACTS_SECURE) || 0);
    return `
    <div class="card card-pad">
      <h3 class="aura-subhead">Origen de destinatarios · Campaña A</h3>
      <p class="text-secondary">La pestaña 'Campana A - HA prioritaria' es la fuente primaria de destinatarios. MKT_CONTACTS_SECURE enriquece y gobierna (DNC, frequency, stopOnResponse) — nunca excluye por falta de sincronización.</p>
      <div class="kpi-grid">
        ${kpi("file-spreadsheet", "Total destinatarios", total)}
        ${kpi("link-2", "MERGED (pestaña + NOVA)", b.MERGED)}
        ${kpi("user-plus", "CONTACT_SOURCE_ONLY (solo pestaña)", b.CAMPANA_A_SOURCE)}
        ${kpi("database", "Solo MKT_CONTACTS_SECURE", b.CONTACTS_SECURE)}
      </div>
    </div>`;
  }

  // Pass 19: the durable per-run audit trail (MKT_AURA_CAMPANA_A_RUN_SUMMARY) -- never depend on
  // the Apps Script execution log to know what the last run actually did. found:false means no
  // run has ever persisted a summary yet (not an error).
  function runSummaryCard(summary) {
    if (!summary) return "";
    if (summary.found === false) return `<div class="card card-pad"><strong>Última corrida:</strong> aún no hay ninguna corrida registrada en MKT_AURA_CAMPANA_A_RUN_SUMMARY.</div>`;
    const s = summary;
    return `
    <div class="card card-pad">
      <h3 class="aura-subhead" style="margin-top:0">Última corrida (auditoría durable, no depende del log)</h3>
      <p class="text-secondary">runId ${esc(s.runId)} · ${esc((s.runAt || "").slice(0, 16).replace("T", " "))} · ${statusBadge(s.status)} · sendMode ${esc(s.sendMode)} · ${fmt(s.totalMs)}ms</p>
      <div class="kpi-grid">
        ${kpi("building-2", "Source accounts", s.sourceAccounts)}
        ${kpi("users", "Source contacts", s.sourceContacts)}
        ${kpi("send", "Recipients", s.recipients)}
        ${kpi("mail", "Preflight wouldSend", s.preflightWouldSend)}
        ${kpi("shield-alert", "Preflight suppressed", s.preflightSuppressed)}
        ${kpi("shield-off", "STOPPED", s.statusStoppedTotal)}
        ${kpi("alert-triangle", "Invalid emails", s.invalidEmailCount)}
        ${kpi("copy", "Duplicate job keys", s.duplicateJobKeys)}
        ${kpi("send", "Real sends detected", s.realSendsDetected)}
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

    ${performanceSection()}
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

    ${runSummaryCard(state.runSummary)}
    ${recipientSourceCard(c.byRecipientSource)}
    ${stoppedBreakdownCard(c.stoppedBreakdown)}
    ${matchReportCard(c.matchReport)}

    <h3 class="aura-subhead">Campañas AURA (todas las familias · datos reales de MKT_AURA_EXECUTION_REPORT)</h3>
    ${campaignsTable(((state.execReport || {}).records) || [])}

    <div class="card card-pad">
      <strong>Provider de envío:</strong> DRY_RUN por defecto en todo el sistema. Ningún envío real ocurre desde este dashboard — esta página es solo de lectura.
      Landing Pages: ver la sección <a href="#/landing-pages">Landing Pages</a> del menú.
    </div>
    `}`;

    bindPerformance(mount);
    global.lucide && global.lucide.createIcons && global.lucide.createIcons();
  }

  async function refresh(mount) {
    if (state.loading || !adapter() || !adapter().isConnected()) return;
    state.loading = true; state.error = ""; state.performance = null; paint(mount);
    try { state.performance = await adapter().v6AuraEmailPerformance(); state.performanceError = ""; }
    catch(error) { state.performanceError = "Email Performance unavailable"; }
    try {
      const [retention, campanaA, matchReport, stoppedBreakdown, execReport, runSummary] = await Promise.all([
        adapter().v6AuraRetentionDashboard ? adapter().v6AuraRetentionDashboard() : null,
        adapter().v6AuraCampanaAAudit ? adapter().v6AuraCampanaAAudit() : null,
        adapter().v6AuraCampanaAMatchReport ? adapter().v6AuraCampanaAMatchReport() : null,
        adapter().v6AuraCampanaAStoppedBreakdown ? adapter().v6AuraCampanaAStoppedBreakdown() : null,
        adapter().v6AuraExecutionReport ? adapter().v6AuraExecutionReport() : null,
        adapter().v6AuraCampanaALatestRunSummary ? adapter().v6AuraCampanaALatestRunSummary() : null
      ]);
      state.retention = retention || {};
      state.campanaA = Object.assign({}, campanaA || {}, { matchReport: matchReport || null, stoppedBreakdown: stoppedBreakdown || null });
      state.execReport = execReport || {};
      state.runSummary = runSummary || null;
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
