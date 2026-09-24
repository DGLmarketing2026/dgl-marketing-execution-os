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
  const perfColumns = ['jobId','company','contactName','email','campaignId','campaignFamily','subject','sentFamily','currentCampaignFamily','playbookId','creativeProvenance','integrityStatus','service','language','amOwner','sendStatus','sentAt','failedAt','bounceStatus','bounceReason','bounceAt','replied','replyAt','opened','openAt','clicked','clickAt'];
  let performancePage = 0,filterTimer;
  function pageRows(rows, page) { return rows.slice().sort((a,b)=>String(b.sentAt||'').localeCompare(String(a.sentAt||''))).slice(page*25,(page+1)*25); }
  function metricMatches(r, metric) {
    return !metric || ({sent:r.sendStatus==='SENT',failed:!!r.failedAt || r.sendStatus==='FAILED',bounced:!!r.bounceStatus,replied:r.replied===true,opened:r.opened===true,clicked:r.clicked===true})[metric];
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
  function performanceCsv(rows,columns=perfColumns) {
    const cell = v => { let s=v==null?'NOT_TRACKED':String(v); if(/^[=+@\-\t\r]/.test(s))s="'"+s; return '"'+s.replace(/"/g,'""')+'"'; };
    return '\uFEFF'+[columns.map(cell).join(','),...rows.map(r=>columns.map(k=>cell(r[k])).join(','))].join('\r\n');
  }
  function performanceSection() {
    const data=state.performance;
    if(!data)return `<section class="card card-pad"><h3>Email Performance</h3><p>${esc(state.performanceError||'Loading recipient report…')}</p></section>`;
    const opts = k => (data.facets?.[k]||[...new Set(data.rows.map(r=>r[k]).filter(Boolean))].sort()).map(v=>`<option ${perfFilters[k]===v?'selected':''} value="${esc(v).replace(/"/g,'&quot;')}">${esc(v)}</option>`).join('');
    return `<section class="aura-performance card card-pad"><h3>Email Performance · FILTERED COHORT</h3><p>GLOBAL: ${fmt((data.summaryGlobal||data.summary).sent)} sent · ${fmt((data.summaryGlobal||data.summary).failed)} failed · ${fmt((data.summaryGlobal||data.summary).bounced)} bounced</p>
      <div class="aura-performance-kpis">${['sent','failed','bounced','replied','opened','clicked'].map(k=>`<button type="button" data-perf-kpi="${k}" aria-pressed="${perfFilters.metric===k}"><span>${k.toUpperCase()}</span><strong>${fmt((data.summaryFiltered||data.summary)[k])}</strong><small>${(data.summaryFiltered||data.summary)[k]==null?'NOT TRACKED':'MEASURED'}</small>${k==='sent'?`<small>${fmt((data.summaryFiltered||data.summary).sentUniqueEmails)} recipient emails · ${fmt((data.summaryFiltered||data.summary).sentUniqueAccounts)} accounts</small>`:''}</button>`).join('')}</div>
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
    const data=state.performance,rows=data.rows||[],page=data.page||1,pages=data.totalPages||1;
    const columns=[['company','Company'],['contactName','Contact'],['email','Email'],['subject','Subject'],['sentFamily','Sent Family'],['sendStatus','Status'],['sentAt','Sent At'],['bounceReason','Bounce'],['replied','Reply'],['creativeProvenance','Creative Source']];
    host.querySelector('[data-perf-detail]').innerHTML='<p aria-live="polite">FILTERED: '+data.totalRows+' of '+data.totalGlobalRows+' recipient rows · Page '+page+' / '+pages+'</p><div class="aura-performance-scroll"><table class="data-table"><thead><tr>'+columns.map(([k,label])=>'<th>'+label+'</th>').join('')+'<th>Action</th></tr></thead><tbody>'+rows.map(r=>'<tr>'+columns.map(([k])=>'<td>'+esc(r[k]==null?'N/A':r[k])+'</td>').join('')+'<td><button data-perf-view="'+esc(r.jobId).replace(/"/g,'&quot;')+'">VIEW EMAIL</button></td></tr>').join('')+'</tbody></table></div><button data-perf-prev '+(page<=1?'disabled':'')+'>Previous</button><button data-perf-next '+(page>=pages?'disabled':'')+'>Next</button>';
    const reload=()=>refreshPerformance(mount);
    host.querySelectorAll('[data-perf-kpi]').forEach(b=>b.onclick=()=>{perfFilters.metric=perfFilters.metric===b.dataset.perfKpi?'':b.dataset.perfKpi;performancePage=0;reload();});
    host.querySelectorAll('[data-perf-filter]').forEach(input=>input.oninput=()=>{perfFilters[input.dataset.perfFilter]=input.value;performancePage=0;clearTimeout(filterTimer);filterTimer=setTimeout(reload,300);});
    host.querySelector('[data-perf-reset]').onclick=()=>{Object.keys(perfFilters).forEach(k=>perfFilters[k]='');performancePage=0;reload();};
    host.querySelector('[data-perf-download]').onclick=async()=>{
      try{
        const exported=await adapter().v6AuraEmailPerformanceExport({...perfFilters});
        if(!Array.isArray(exported.rows))throw Error("EXPORT_UNAVAILABLE");
        const blob=new Blob([performanceCsv(exported.rows,exported.columns)],{type:'text/csv;charset=utf-8'});
        const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='aura-email-performance.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }catch(e){host.querySelector('[data-perf-detail]').textContent='Export unavailable. Narrow the filters and retry.';}
    };
    host.onclick=event=>{
      const view=event.target.closest('[data-perf-view]');if(view){openEmail(view.dataset.perfView);return;}
      if(event.target.closest('[data-perf-prev]')&&page>1){performancePage=page-2;reload();}
      if(event.target.closest('[data-perf-next]')&&page<pages){performancePage=page;reload();}
    };
  }
  function downloadExactHtml(detail) {
    const url=URL.createObjectURL(new Blob([detail.htmlBody],{type:'text/html;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=String(detail.jobId).replace(/[^a-z0-9_-]/gi,'_')+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function openEmail(jobId) {
    const dialog=document.createElement('dialog');dialog.className='aura-email-audit';
    dialog.setAttribute('aria-label','Historical sent email audit');
    dialog.innerHTML='<button data-email-close>CLOSE</button><p>Loading persisted email evidence…</p>';
    document.body.appendChild(dialog);dialog.showModal();
    dialog.addEventListener('close',()=>dialog.remove());
    dialog.querySelector('[data-email-close]').onclick=()=>dialog.close();
    try {
      const detail=await adapter().v6AuraEmailPerformanceJob(jobId);
      if(!dialog.open)return;
      if(!detail||!detail.jobId||['NOT_FOUND','INVALID_REQUEST','AMBIGUOUS_JOB_ID'].includes(detail.status))throw new Error('Persisted job not available');
      const fields=[['Company',detail.company],['Contact',detail.contactName||detail.firstName],['Recipient',detail.email],['Campaign ID',detail.campaignId],['Job ID',detail.jobId],['Service',detail.service],['Language',detail.language],['AM Owner',detail.amOwner],['Sent At',detail.sentAt],['Status',detail.status],['SENT FAMILY',detail.sentFamily],['CURRENT CAMPAIGN FAMILY',detail.currentCampaignFamily],['CREATIVE SOURCE',detail.creativeProvenance==='LEGACY_PRE_CANONICAL'?'LEGACY / PRE-CANONICAL SEND':detail.creativeProvenance==='CAMPAIGN_STUDIO_APPROVED'?'CAMPAIGN STUDIO APPROVED':'UNVERIFIED'],['INTEGRITY',String(detail.integrityStatus||'').replace(/_/g,' ')]];
      dialog.innerHTML=`<button data-email-close>CLOSE</button><h2>Historical email · read-only</h2><dl>${fields.map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value||'N/A')}</dd></div>`).join('')}</dl>
        ${detail.sentFamily&&detail.currentCampaignFamily&&detail.sentFamily!==detail.currentCampaignFamily?'<p class="aura-audit-badge">HISTORICAL SEND FAMILY DIFFERS FROM CURRENT CAMPAIGN DEFINITION</p>':''}
        <h3>SUBJECT</h3><p>${esc(detail.subject)}</p><button data-email-copy>COPY SUBJECT</button><button data-email-download>DOWNLOAD HTML</button><p data-email-feedback role="status"></p>
        <h3>Delivery evidence</h3><p>SEND: ${esc(detail.status)} · ${esc(detail.sentAt||detail.failedAt||detail.processedAt)}</p><p>BOUNCE: ${esc(detail.bounceStatus==='SOFT_BOUNCE'?'SOFT_BOUNCE':detail.bounceReason||'NONE')} · ${esc(detail.bounceAt)} · ${esc(detail.bounceReason)}</p><p>REPLY: ${detail.replied?'YES':'NO'} · ${esc(detail.replyAt)}</p><p>OPEN: ${detail.opened===null?'N/A — NOT TRACKED':detail.opened?'YES':'NO'} · ${esc(detail.openAt)}</p><p>CLICK: ${detail.clicked===null?'N/A — NOT TRACKED':detail.clicked?'YES':'NO'} · ${esc(detail.clickAt)}</p>
        <details><summary>Additional persisted evidence</summary><pre>${esc(JSON.stringify(Object.fromEntries(Object.entries(detail).filter(([key])=>key!=='htmlBody')),null,2))}</pre></details>
        <h3>EXACT SENT EMAIL PREVIEW</h3><div data-email-preview></div>`;
      dialog.querySelector('[data-email-close]').onclick=()=>dialog.close();
      dialog.querySelector('[data-email-copy]').onclick=async()=>{try{await navigator.clipboard.writeText(detail.subject);dialog.querySelector('[data-email-feedback]').textContent='Subject copied';}catch(_){dialog.querySelector('[data-email-feedback]').textContent='Clipboard unavailable';}};
      dialog.querySelector('[data-email-download]').onclick=()=>downloadExactHtml(detail);
      const preview=dialog.querySelector('[data-email-preview]');
      if(!detail.htmlBody)preview.textContent='EMAIL BODY NOT AVAILABLE — NO CONTENT WILL BE RECONSTRUCTED';
      else {
        const frame=document.createElement('iframe');frame.setAttribute('sandbox','');frame.setAttribute('referrerpolicy','no-referrer');frame.setAttribute('tabindex','-1');frame.setAttribute('inert','');frame.setAttribute('title','Exact persisted sent email');frame.style.pointerEvents='none';frame.srcdoc=detail.htmlBody;preview.appendChild(frame);
      }
    } catch(error) {
      if(dialog.open){dialog.innerHTML='<button data-email-close>CLOSE</button><p role="alert">Unable to load persisted email evidence.</p>';dialog.querySelector('[data-email-close]').onclick=()=>dialog.close();}
    }
  }
  global.DGL_AURA_PERFORMANCE = {filter:filterPerformance,csv:performanceCsv,page:pageRows,openEmail:openEmail};

  function statusBadge(status) {
    const s = String(status || "").toUpperCase();
    const tone = s.indexOf("SEND PROVIDER") >= 0 ? "warn" : s === "ACTIVE" || s === "SENDING" ? "live" : s.indexOf("READY") >= 0 || s === "QUEUED" ? "ready" : "idle";
    return `<span class="aura-badge aura-badge-${tone}">${esc(status || "—")}</span>`;
  }

  function kpi(icon, label, value, foot) {
    if(value == null || (typeof value === "number" && !Number.isFinite(value)) ||
      (typeof value === "string" && /^(?:NaN|[+-]?Infinity|undefined|null)?$/i.test(value.trim()))) value = "N/A";
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
        <span class="sample-flag">${connected ? platformHealth() : connectionState.state === "CONNECTING" ? "CONNECTING" : "PRIVATE BACKEND REQUIRED"}</span>
        ${connected
        ? '<button class="btn btn-secondary" data-aura-refresh>REFRESH</button>'
        : `<button class="btn btn-primary" data-aura-connect ${connectionState.state === "CONNECTING" ? "disabled" : ""}>${connectionState.state === "CONNECTING" ? "CONNECTING" : "CONNECT PRIVATE BACKEND"}</button>`}
      </div>
    </div>

    ${!connected ? `<div class="card card-pad"><strong>${state.loading ? "Cargando…" : state.error || "Conecta el backend privado para ver datos reales de AURA."}</strong></div>` : `

    ${healthPanel()}
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
    <p>CURRENT CANONICAL FAMILY: ${esc(c.currentCanonicalFamily||"UNKNOWN")} · HISTORICAL SENT FAMILY: ${esc((c.historicalSentFamilies||[]).join(", ")||"UNKNOWN")} · Historical sent recipient jobs: ${fmt(c.historicalSentRecipientJobs)} · Historical unique accounts: ${fmt(c.historicalUniqueAccounts)}</p>
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


  const reportSpecs={performance:"v6AuraEmailPerformance",retention:"v6AuraRetentionDashboard",campanaA:"v6AuraCampanaAAudit",matchReport:"v6AuraCampanaAMatchReport",stoppedBreakdown:"v6AuraCampanaAStoppedBreakdown",execReport:"v6AuraExecutionReport",runSummary:"v6AuraCampanaALatestRunSummary"};
  const reportHealth={};let refreshPromise=null,performanceSequence=0;
  const performancePayload=()=>({...perfFilters,page:performancePage+1,pageSize:25});
  function healthOf(key){
    const h=reportHealth[key]||{status:"NOT_AVAILABLE",fetchedAt:null,error:"",source:reportSpecs[key]};
    return {...h,status:h.status==="FRESH"&&Date.now()-Date.parse(h.fetchedAt)>120000?"STALE":h.status};
  }
  function platformHealth(){
    const statuses=Object.keys(reportSpecs).map(k=>healthOf(k).status);
    return statuses.every(s=>s==="FRESH")?"PRIVATE BACKEND / LIVE":statuses.includes("ERROR")||statuses.includes("NOT_AVAILABLE")||statuses.includes("LOADING")?"PRIVATE BACKEND / DEGRADED":"PRIVATE BACKEND / STALE";
  }
  function healthPanel(){
    return '<section class="card card-pad"><h3>Report health</h3>'+Object.keys(reportSpecs).map(k=>{const h=healthOf(k);return '<p><strong>'+esc(k)+' · '+h.status+'</strong> · Latest successful fetch: '+esc(h.fetchedAt||'Never')+(h.error?' · '+esc(h.error):'')+'</p>';}).join('')+'</section>';
  }
  function settleReport(key,result){
    const previous=reportHealth[key]||{};
    if(result.status==="fulfilled"&&result.value!=null){state[key]=result.value;reportHealth[key]={status:"FRESH",fetchedAt:new Date().toISOString(),error:"",source:reportSpecs[key]};}
    else{reportHealth[key]={status:state[key]!=null?"STALE":result.status==="fulfilled"?"NOT_AVAILABLE":"ERROR",fetchedAt:previous.fetchedAt||null,error:result.status==="rejected"?"REPORT_UNAVAILABLE":"REPORT_NOT_AVAILABLE",source:reportSpecs[key]};}
  }
  function refresh(mount){
    if(refreshPromise)return refreshPromise;
    if(!adapter()?.isConnected())return Promise.resolve();
    state.loading=true;state.error="";
    const keys=Object.keys(reportSpecs);
    keys.forEach(k=>{reportHealth[k]={...(reportHealth[k]||{}),status:"LOADING",source:reportSpecs[k]};});
    paint(mount);
    refreshPromise=(async()=>{
      const results=await Promise.allSettled(keys.map(k=>Promise.resolve().then(()=>adapter()[reportSpecs[k]]?adapter()[reportSpecs[k]](k==="performance"?performancePayload():undefined):null)));
      keys.forEach((k,i)=>settleReport(k,results[i]));
      if(state.campanaA)state.campanaA={...state.campanaA,matchReport:state.matchReport,stoppedBreakdown:state.stoppedBreakdown};
      state.performanceError=healthOf("performance").error;
    })().finally(()=>{state.loading=false;refreshPromise=null;paint(mount);});
    return refreshPromise;
  }
  async function refreshPerformance(mount){
    const sequence=++performanceSequence,filters=performancePayload();
    reportHealth.performance={...(reportHealth.performance||{}),status:"LOADING",source:reportSpecs.performance};
    try{const value=await adapter().v6AuraEmailPerformance(filters);if(sequence===performanceSequence)settleReport("performance",{status:"fulfilled",value});}
    catch(e){if(sequence===performanceSequence)settleReport("performance",{status:"rejected"});}
    if(sequence===performanceSequence)paint(mount);
  }
  let currentMount = null;
  async function render(mount) {
    currentMount = mount;
    paint(mount);
    if (adapter() && adapter().isConnected()) await refresh(mount);
  }

  global.document && global.document.addEventListener("click", async (event) => {
    if (event.target.closest("[data-aura-connect]")) {
      try { await adapter().connect(); if (adapter().isConnected()) await refresh(currentMount); } catch (error) { state.error = "BACKEND_UNAVAILABLE"; paint(currentMount); }
    } else if (event.target.closest("[data-aura-refresh]")) {
      await refresh(currentMount);
    }
  });
  global.addEventListener && global.addEventListener("dgl:v55-backend-change", (event) => {
    if (!global.location || !global.location.hash.includes("aura-overview")) return;
    if ((event.detail || {}).state === "PRIVATE_BACKEND") refresh(currentMount); else paint(currentMount);
  });

  global.DGL_AURA_HEALTH={refresh,healthOf,platformHealth,getState:()=>state};
  global.DGL_MODULE_RENDERERS = global.DGL_MODULE_RENDERERS || {};
  global.DGL_MODULE_RENDERERS["aura-overview"] = render;
})(window);
