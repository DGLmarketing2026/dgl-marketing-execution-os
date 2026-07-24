/**
 * DGL Marketing Execution OS — Module Renderers
 * Each function renders one of the 16 required modules into a container.
 * All data is pulled from window.DGL_DATA (sample data layer).
 * All markup is built from the reusable components in /components.
 */
(function (global) {
  "use strict";

  const D = () => global.DGL_DATA;
  const UI = () => global.DGL_UI;
  const CH = () => global.DGL_CHARTS;

  /* ---------------------------------------------------------------
   * SHARED HELPERS
   * --------------------------------------------------------------- */
  const STATUS_BADGE_MAP = {
    "Active": ["badge-success", "Activa"],
    "At Risk": ["badge-warning", "En Riesgo"],
    "Inactive-30": ["badge-warning", "Inactiva 30d"],
    "Inactive-60": ["badge-danger", "Inactiva 60d"],
    "Inactive-90": ["badge-danger", "Inactiva 90d"],
    "Inactive-120": ["badge-danger", "Inactiva 120d+"],
    "Quoted-Not-Booked": ["badge-info", "Cotiza / No Embarca"],
    "Dormant-was-recurrent": ["badge-danger", "Dormida (era recurrente)"]
  };
  function statusBadge(status) {
    const [cls, label] = STATUS_BADGE_MAP[status] || ["badge-muted", status];
    return `<span class="badge ${cls}">${label}</span>`;
  }
  function tierBadge(tier) {
    return `<span class="badge badge-tier">${tier}</span>`;
  }
  function money(v) { return "$" + Number(v).toLocaleString("en-US"); }
  function scoreRing(score) {
    return `<span class="score-ring" style="--score:${score}"><span>${score}</span></span>`;
  }
  function sampleFlag() {
    return `<span class="sample-flag"><i data-lucide="flask-conical" style="width:11px;height:11px"></i> Sample Data</span>`;
  }
  function pageHead({ eyebrow, title, lede, actions }) {
    return `
    <div class="page-head">
      <div>
        <div class="eyebrow">${eyebrow}</div>
        <h2>${title}</h2>
        <p class="lede">${lede}</p>
      </div>
      <div class="page-head-actions">${actions || ""} ${sampleFlag()}</div>
    </div>`;
  }
  function sectionHeading(title, hint) {
    return `<div class="section-heading"><h3>${title}</h3>${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
  }
  function afterRender() {
    if (global.lucide) global.lucide.createIcons();
  }

  /* ===================================================================
   * 1. EXECUTIVE MARKETING COMMAND CENTER
   * =================================================================== */
  function renderCommandCenter(container) {
    const A = D().analytics;
    const plan = D().mondayActionPlan;

    container.innerHTML = `
      ${pageHead({
        eyebrow: "Command Center",
        title: "Executive Marketing Command Center",
        lede: "Marketing como motor de revenue: visión ejecutiva del impacto directo sobre conversión, retención y crecimiento de la cartera.",
        actions: `<button class="btn btn-primary" data-action="open-create-campaign"><i data-lucide="plus"></i>Nueva Campaña</button>`
      })}

      ${UI().kpiGrid([
        { icon: "dollar-sign", label: "Revenue influenciado por Marketing", value: A.revenueInfluenced, format: "currency-compact", delta: A.revenueInfluencedDelta, foot: "Últimos 30 días vs. periodo anterior" },
        { icon: "megaphone", label: "Campañas activas", value: A.activeCampaigns, foot: D().campaigns.filter(c=>c.status==='Active').length + " en ejecución esta semana" },
        { icon: "refresh-cw", label: "Cuentas reactivadas", value: A.accountsReactivated, delta: A.accountsReactivatedDelta, foot: "Cuentas que volvieron a cotizar o embarcar" },
        { icon: "file-check-2", label: "Cotizaciones recuperadas", value: A.quotesRecovered, delta: A.quotesRecoveredDelta, foot: "De cotizaciones sin respuesta inicial" }
      ])}
      <div style="height:16px"></div>
      ${UI().kpiGrid([
        { icon: "mail", label: "Emails enviados (30d)", value: A.emailsSent, iconBg: "rgba(56,189,248,0.14)", iconFg: "var(--info)" },
        { icon: "reply", label: "Tasa de respuesta", value: A.responseRate, format: "percent", delta: A.responseRateDelta, iconBg: "rgba(56,189,248,0.14)", iconFg: "var(--info)" },
        { icon: "shuffle", label: "Pipeline generado en cartera", value: A.pipelineGenerated, format: "currency-compact", iconBg: "rgba(139,92,246,0.14)", iconFg: "#c9b6ff" },
        { icon: "activity", label: "Conversión cotización → carga", value: A.quoteToLoadConversion, format: "percent", delta: A.quoteToLoadConversionDelta, iconBg: "rgba(139,92,246,0.14)", iconFg: "#c9b6ff" }
      ])}

      <div class="grid-2" style="margin-top:26px">
        <div class="card chart-card">
          <div class="chart-head">
            <div><h4>Revenue Influenciado por Marketing</h4><span class="hint">Tendencia mensual — cartera existente vs. total DGL</span></div>
          </div>
          <div class="chart-canvas-wrap"><canvas id="chartRevenueTrend"></canvas></div>
        </div>
        <div class="card card-pad">
          <div class="section-heading" style="margin-top:0"><h3>Monday Action Plan</h3><span class="hint">Prioridades de la semana</span></div>
          <div class="action-list">
            ${plan.map((a, i) => `
              <div class="action-row">
                <div class="action-priority ${a.priority === 'Crítica' ? 'critical' : a.priority === 'Alta' ? 'high' : 'medium'}"></div>
                <div class="action-check" data-action="toggle-action" data-idx="${i}"><i data-lucide="check" style="width:14px;height:14px"></i></div>
                <div class="action-text">${a.action}<div class="action-meta">${a.module} · ${a.owner}</div></div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>

      ${sectionHeading("Desempeño de Campañas por Tipo", "Tasa de conversión sobre cartera existente")}
      <div class="card chart-card">
        <div class="chart-canvas-wrap" style="height:220px"><canvas id="chartCampaignPerf"></canvas></div>
      </div>
    `;

    CH().revenueTrendChart("chartRevenueTrend", A.monthlyRevenueTrend);
    CH().campaignPerformanceChart("chartCampaignPerf", A.campaignPerformance);
    afterRender();
  }

  /* ===================================================================
   * 2. CAMPAIGN EXECUTION CENTER
   * =================================================================== */
  function renderCampaignExecution(container, alreadySynced) {
    const campaigns = D().campaigns;
    const types = [...new Set(campaigns.map((c) => c.type))];
    const statuses = [...new Set(campaigns.map((c) => c.status))];

    container.innerHTML = `
      ${pageHead({
        eyebrow: "Campaign Execution Center",
        title: "Centro de Ejecución de Campañas",
        lede: "Planeación, lanzamiento y monitoreo de campañas orientadas a conversión, reactivación, retención y crecimiento de cartera." + (D().meta.liveSync ? " — Conectado a datos reales." : ""),
        actions: `<button class="btn btn-primary" data-action="open-create-campaign"><i data-lucide="plus"></i>Crear Campaña</button>`
      })}
      ${UI().filterBar({ scope: "campaigns", searchPlaceholder: "Buscar campaña...", selects: [{ key: "type", label: "Tipo", options: types }, { key: "status", label: "Estado", options: statuses }], resultCount: campaigns.length })}
      <div id="campaignResults"></div>
    `;

    const scope = container;
    function renderResults(list) {
      scope.querySelector("#campaignResults").innerHTML = UI().campaignGrid(list);
      afterRender();
    }
    renderResults(campaigns);
    global.DGL_INTERACTIONS.wireFilters(scope, campaigns, { search: ["name", "objective", "segment"] }, renderResults);
    afterRender();

    // Refresh once from the real Campaign Execution API (Apps Script + Sheet).
    // Falls back silently to sample data if the API is unreachable; on
    // success it re-renders this same module with the live campaigns.
    if (!alreadySynced && global.DGL_API) {
      global.DGL_API.refreshCampaignsFromAPI().then(function (changed) {
        const stillOnThisView = window.location.hash.replace("#/", "").trim() === "campaign-execution";
        if (changed && stillOnThisView) {
          renderCampaignExecution(container, true);
        }
      });
    }
  }

  /* ===================================================================
   * 3. EMAIL MARKETING CENTER
   * =================================================================== */
  function renderEmailMarketing(container) {
    const seqs = D().emailSequences;
    container.innerHTML = `
      ${pageHead({
        eyebrow: "Email Marketing Center",
        title: "Centro de Email Marketing",
        lede: "Secuencias accionables activadas por comportamiento: cotización, inactividad, retención y cross selling.",
        actions: `<button class="btn btn-primary" data-action="open-sequence-builder"><i data-lucide="plus"></i>Nueva Secuencia</button>`
      })}
      ${UI().kpiGrid([
        { icon: "send", label: "Secuencias activas", value: seqs.filter(s=>s.status==='Active').length, iconBg:"rgba(56,189,248,0.14)", iconFg:"var(--info)" },
        { icon: "mail-open", label: "Open rate promedio", value: Math.round(seqs.reduce((a,s)=>a+s.metrics.openRate,0)/seqs.length), format:"percent" },
        { icon: "reply-all", label: "Reply rate promedio", value: Math.round(seqs.reduce((a,s)=>a+s.metrics.replyRate,0)/seqs.length), format:"percent" },
        { icon: "layers", label: "Emails en biblioteca", value: D().assets.filter(a=>a.type==="Email Listo").length + seqs.reduce((a,s)=>a+s.emails.length,0) }
      ])}

      ${sectionHeading("Secuencias de Email — Lógica de Activación", "Cada secuencia se dispara por comportamiento del cliente, no por calendario")}
      <div class="stack">
        ${seqs.map((s) => `
          <div class="card card-pad">
            <div class="flex justify-between items-center" style="flex-wrap:wrap;gap:10px">
              <div>
                <h4 style="font-size:14.5px;margin-bottom:4px">${s.name}</h4>
                <span class="text-secondary" style="font-size:12px"><i data-lucide="zap" style="width:12px;height:12px;display:inline;vertical-align:-2px;color:var(--secondary)"></i> Trigger: ${s.trigger} · Segmento: ${s.segment}</span>
              </div>
              <div class="flex gap-8 items-center">
                <span class="tag">Enviados: ${s.metrics.sent}</span>
                <span class="tag">Open: ${s.metrics.openRate}%</span>
                <span class="tag" style="color:var(--secondary);border-color:var(--secondary-border)">Reply: ${s.metrics.replyRate}%</span>
                <span class="badge ${s.status==='Active' ? 'badge-success' : 'badge-muted'}">${s.status}</span>
              </div>
            </div>
            <div class="flow-strip" style="margin-top:14px">
              ${s.emails.map((e, i) => `
                <div class="flow-step">
                  <div class="flow-label">Paso ${e.step} · ${e.timing}</div>
                  <div class="flow-value">${e.subject}</div>
                  <div class="text-muted" style="margin-top:4px;font-size:11px">${e.preheader}</div>
                </div>
                ${i < s.emails.length - 1 ? `<div class="flow-arrow"><i data-lucide="arrow-right"></i></div>` : ""}
              `).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    `;
    afterRender();
  }

  /* ===================================================================
   * 4. QUOTED NOT BOOKED RECOVERY
   * =================================================================== */
  function renderQuotedNotBooked(container) {
    const rows = D().quotedNotBooked;
    const services = [...new Set(rows.map(r => r.service))];
    container.innerHTML = `
      ${pageHead({
        eyebrow: "Critical Module",
        title: "Quoted Not Booked Recovery",
        lede: "Cotizaciones enviadas que no se convirtieron en carga. Cada registro incluye probabilidad de recuperación y la acción exacta a ejecutar.",
        actions: `<button class="btn btn-primary" data-action="open-create-campaign" data-preset="Recuperación de Cotizaciones"><i data-lucide="rotate-ccw"></i>Lanzar Campaña de Recuperación</button>`
      })}
      ${UI().kpiGrid([
        { icon: "file-warning", label: "Cotizaciones sin conversión", value: rows.length, iconBg:"rgba(245,158,11,0.14)", iconFg:"var(--warning)" },
        { icon: "dollar-sign", label: "Valor cotizado en riesgo", value: rows.reduce((a,r)=>a+r.quotedValue,0), format: "currency" },
        { icon: "trending-up", label: "Alta probabilidad de recuperación", value: rows.filter(r=>r.recoveryProbability==="Alta").length },
        { icon: "clock", label: "Días promedio sin respuesta", value: Math.round(rows.reduce((a,r)=>a+r.daysNoResponse,0)/rows.length) }
      ])}
      ${UI().filterBar({ scope: "qnb", searchPlaceholder: "Buscar cliente...", selects: [{ key: "service", label: "Servicio", options: services }, { key: "recoveryProbability", label: "Probabilidad", options: ["Alta","Media","Baja"] }], resultCount: rows.length })}
      <div id="qnbResults"></div>
    `;

    const columns = [
      { key: "customer", label: "Cliente", primary: true },
      { key: "service", label: "Servicio" },
      { key: "quotedValue", label: "Valor Cotizado", render: (r) => money(r.quotedValue) },
      { key: "quoteDate", label: "Fecha Cotización" },
      { key: "daysNoResponse", label: "Días sin Respuesta", render: (r) => `<span class="${r.daysNoResponse > 14 ? 'text-danger' : 'text-secondary'}">${r.daysNoResponse}d</span>` },
      { key: "lossReason", label: "Motivo" },
      { key: "recoveryProbability", label: "Probabilidad", render: (r) => `<span class="badge ${r.recoveryProbability==='Alta'?'badge-success':r.recoveryProbability==='Media'?'badge-warning':'badge-danger'}">${r.recoveryProbability}</span>` },
      { key: "nextAction", label: "Próxima Acción" }
    ];
    const rowActions = (r) => `<button class="btn btn-secondary btn-sm" data-action="open-recovery-detail" data-id="${r.id}">Ver Plan</button>`;

    function renderResults(list) {
      container.querySelector("#qnbResults").innerHTML = UI().dataTable({ columns, rows: list, rowActions, mobileTitle: (r) => r.customer });
      afterRender();
    }
    renderResults(rows);
    global.DGL_INTERACTIONS.wireFilters(container, rows, { search: ["customer", "service"] }, renderResults);
    afterRender();
  }

  /* ===================================================================
   * 5. REACTIVATION CENTER
   * =================================================================== */
  function renderReactivation(container) {
    const inactiveStatuses = ["Inactive-30", "Inactive-60", "Inactive-90", "Inactive-120", "Dormant-was-recurrent", "Quoted-Not-Booked"];
    const rows = D().customers.filter(c => inactiveStatuses.includes(c.status));
    container.innerHTML = `
      ${pageHead({
        eyebrow: "Reactivation Center",
        title: "Centro de Reactivación de Cuentas",
        lede: "Cuentas inactivas segmentadas por antigüedad de inactividad, con causa probable de enfriamiento y campaña sugerida.",
        actions: `<button class="btn btn-primary" data-action="open-create-campaign" data-preset="Reactivación"><i data-lucide="refresh-cw"></i>Lanzar Reactivación</button>`
      })}
      ${UI().kpiGrid([
        { icon: "user-x", label: "Cuentas inactivas totales", value: rows.length },
        { icon: "dollar-sign", label: "Revenue histórico en riesgo", value: rows.reduce((a,c)=>a+c.revenueHistoric,0), format: "currency-compact" },
        { icon: "alarm-clock", label: "30-60 días", value: D().customers.filter(c=>c.status==='Inactive-30'||c.status==='Inactive-60').length, iconBg:"rgba(245,158,11,0.14)", iconFg:"var(--warning)" },
        { icon: "skull", label: "90+ días / Dormidas", value: D().customers.filter(c=>['Inactive-90','Inactive-120','Dormant-was-recurrent'].includes(c.status)).length, iconBg:"rgba(239,68,68,0.14)", iconFg:"var(--danger)" }
      ])}
      ${UI().filterBar({ scope: "reactivation", searchPlaceholder: "Buscar cuenta...", selects: [{ key: "status", label: "Segmento", options: inactiveStatuses }, { key: "region", label: "Región", options: D().regions }], resultCount: rows.length })}
      <div id="reactivationResults"></div>
    `;

    const columns = [
      { key: "name", label: "Cuenta", primary: true },
      { key: "status", label: "Segmento", render: (r) => statusBadge(r.status) },
      { key: "lastLoadDate", label: "Última Carga" },
      { key: "revenueHistoric", label: "Revenue Histórico", render: (r) => money(r.revenueHistoric) },
      { key: "servicesUsed", label: "Servicio Usado", render: (r) => r.servicesUsed.join(", ") },
      { key: "recommendedService", label: "Servicio Sugerido", render: (r) => `<span class="tag">${r.recommendedService}</span>` },
      { key: "coolingReason", label: "Motivo Probable" },
      { key: "nextAction", label: "Próxima Acción" }
    ];
    const rowActions = (r) => `<button class="btn btn-secondary btn-sm" data-action="open-reactivation-detail" data-id="${r.id}">Ver Cuenta</button>`;

    function renderResults(list) {
      container.querySelector("#reactivationResults").innerHTML = UI().dataTable({ columns, rows: list, rowActions, mobileTitle: (r) => r.name });
      afterRender();
    }
    renderResults(rows);
    global.DGL_INTERACTIONS.wireFilters(container, rows, { search: ["name", "industry"] }, renderResults);
    afterRender();
  }

  /* ===================================================================
   * 6. CUSTOMER GROWTH CENTER
   * =================================================================== */
  function renderGrowth(container) {
    const rows = D().growthOpportunities;
    container.innerHTML = `
      ${pageHead({
        eyebrow: "Customer Growth Center",
        title: "Centro de Crecimiento de Cuentas",
        lede: "Oportunidades de Cross Selling, Upselling y expansión de servicio dentro de la cartera activa.",
        actions: `<button class="btn btn-primary" data-action="open-create-campaign" data-preset="Cross Selling"><i data-lucide="trending-up"></i>Lanzar Campaña de Crecimiento</button>`
      })}
      ${UI().kpiGrid([
        { icon: "target", label: "Cuentas con oportunidad identificada", value: rows.length },
        { icon: "dollar-sign", label: "Uplift estimado total", value: rows.reduce((a,r)=>a+r.estimatedUplift,0), format: "currency-compact" },
        { icon: "arrow-up-right", label: "Cross Selling generado (30d)", value: D().analytics.crossSellGenerated, format: "currency-compact", iconBg:"rgba(139,92,246,0.14)", iconFg:"#c9b6ff" },
        { icon: "bar-chart-2", label: "Upselling generado (30d)", value: D().analytics.upsellGenerated, format: "currency-compact", iconBg:"rgba(139,92,246,0.14)", iconFg:"#c9b6ff" }
      ])}
      ${sectionHeading("Matriz de Oportunidad por Cuenta", "Ordenado por score de oportunidad")}
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Cuenta</th><th>Servicios Actuales</th><th>Servicio Sugerido</th><th>Racional</th><th>Uplift Estimado</th><th>Score</th><th></th></tr></thead>
          <tbody>
            ${rows.sort((a,b)=>b.opportunityScore-a.opportunityScore).map(r => `
              <tr>
                <td class="cell-primary">${r.customer}</td>
                <td>${r.currentServices.map(s=>`<span class="tag" style="margin-right:4px">${s}</span>`).join("")}</td>
                <td><span class="badge badge-success">${r.suggestedService}</span></td>
                <td class="cell-muted" style="max-width:240px">${r.rationale}</td>
                <td>${money(r.estimatedUplift)}</td>
                <td>${scoreRing(r.opportunityScore)}</td>
                <td><button class="btn btn-secondary btn-sm" data-action="open-growth-detail" data-id="${r.customerId}">Activar</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      ${sectionHeading("Lógica de Cross Selling por Servicio", "Ejemplos aplicados a la cartera de DGL")}
      <div class="grid-3">
        <div class="card card-pad"><i data-lucide="container" style="color:var(--secondary);margin-bottom:8px"></i><h4 style="font-size:13.5px;margin-bottom:6px">Drayage → Transloading / Storage</h4><p class="text-secondary" style="font-size:12px">Clientes con Drayage recurrente son candidatos naturales a servicios de consolidación.</p></div>
        <div class="card card-pad"><i data-lucide="truck" style="color:var(--secondary);margin-bottom:8px"></i><h4 style="font-size:13.5px;margin-bottom:6px">FTL → Cross Border / Intermodal</h4><p class="text-secondary" style="font-size:12px">Volumen consistente en FTL habilita expansión hacia corredores cross-border.</p></div>
        <div class="card card-pad"><i data-lucide="package" style="color:var(--secondary);margin-bottom:8px"></i><h4 style="font-size:13.5px;margin-bottom:6px">LTL → FTL / Warehousing</h4><p class="text-secondary" style="font-size:12px">Frecuencia alta de embarques pequeños sugiere oportunidad de consolidación o almacenamiento.</p></div>
      </div>
    `;
    afterRender();
  }

  /* ===================================================================
   * 7. ACCOUNT-BASED MARKETING CENTER
   * =================================================================== */
  function renderABM(container) {
    const abm = D().abmAccounts;
    container.innerHTML = `
      ${pageHead({
        eyebrow: "Account-Based Marketing",
        title: "Centro de Marketing por Cuenta Clave",
        lede: "Cuentas estratégicas con perfil, mensaje recomendado, campaña activa y score de oportunidad para ejecución 1:1.",
        actions: `<button class="btn btn-primary" data-action="open-add-abm"><i data-lucide="crosshair"></i>Agregar Cuenta ABM</button>`
      })}
      <div class="grid-cards">
        ${abm.map(a => `
          <div class="card card-pad interactive">
            <div class="flex justify-between items-center" style="margin-bottom:10px">
              <span class="badge badge-tier">Cuenta Estratégica</span>
              ${scoreRing(a.opportunityScore)}
            </div>
            <h4 style="font-size:15px;margin-bottom:4px">${a.name}</h4>
            <p class="text-secondary" style="font-size:12px;margin-bottom:12px">${a.profile}</p>
            <div class="flex gap-8" style="flex-wrap:wrap;margin-bottom:12px">
              ${a.currentServices.map(s=>`<span class="tag">${s}</span>`).join("")}
            </div>
            <div class="divider" style="margin:10px 0"></div>
            <div style="font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Estado Comercial</div>
            <div style="font-size:12.5px;margin-bottom:10px">${a.commercialStatus}</div>
            <div style="font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Servicio Sugerido</div>
            <div style="margin-bottom:10px"><span class="badge badge-success">${a.suggestedServices.join(", ")}</span></div>
            <div style="font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Mensaje Recomendado</div>
            <p style="font-size:12.5px;margin-bottom:12px">${a.recommendedMessage}</p>
            <div class="campaign-card-foot">
              <span class="campaign-next"><strong>Próximo:</strong> ${a.nextAction}</span>
            </div>
            <button class="btn btn-secondary btn-sm w-full" style="margin-top:10px" data-action="open-abm-detail" data-id="${a.id}">Ver Cuenta Completa <i data-lucide="arrow-right"></i></button>
          </div>
        `).join("")}
      </div>
    `;
    afterRender();
  }

  /* ===================================================================
   * 8. CUSTOMER RETENTION CAMPAIGNS
   * =================================================================== */
  function renderRetention(container) {
    const atRisk = D().customers.filter(c => c.status === "At Risk");
    const retCampaigns = D().retentionCampaigns;
    container.innerHTML = `
      ${pageHead({
        eyebrow: "Customer Retention",
        title: "Campañas de Retención de Clientes",
        lede: "Comunicación preventiva para evitar la fuga de cuentas activas antes de que se enfríen.",
        actions: `<button class="btn btn-primary" data-action="open-create-campaign" data-preset="Retención"><i data-lucide="shield-check"></i>Nueva Campaña Preventiva</button>`
      })}
      ${UI().kpiGrid([
        { icon: "shield-alert", label: "Cuentas At Risk", value: atRisk.length, iconBg:"rgba(245,158,11,0.14)", iconFg:"var(--warning)" },
        { icon: "shield-check", label: "Cuentas retenidas (30d)", value: D().analytics.accountsRetained },
        { icon: "dollar-sign", label: "Revenue en riesgo", value: atRisk.reduce((a,c)=>a+c.revenueYTD,0), format: "currency-compact" },
        { icon: "megaphone", label: "Campañas preventivas activas", value: retCampaigns.filter(r=>r.status==='Active').length }
      ])}

      ${sectionHeading("Cuentas en Riesgo — Intervención Prioritaria")}
      <div class="table-wrap" style="margin-bottom:26px">
        <table class="data-table">
          <thead><tr><th>Cuenta</th><th>Tier</th><th>Motivo</th><th>Revenue YTD</th><th>Account Manager</th><th>Próxima Acción</th><th></th></tr></thead>
          <tbody>
            ${atRisk.map(c => `
              <tr>
                <td class="cell-primary">${c.name}</td>
                <td>${tierBadge(c.tier)}</td>
                <td class="cell-muted">${c.coolingReason || "—"}</td>
                <td>${money(c.revenueYTD)}</td>
                <td>${c.accountManager}</td>
                <td>${c.nextAction}</td>
                <td><button class="btn btn-secondary btn-sm" data-action="open-reactivation-detail" data-id="${c.id}">Ver Cuenta</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      ${sectionHeading("Comunicaciones Preventivas Programadas")}
      <div class="grid-cards">
        ${retCampaigns.map(r => `
          <div class="card card-pad">
            <span class="tag" style="margin-bottom:8px;display:inline-block">${r.type}</span>
            <h4 style="font-size:14px;margin-bottom:8px">${r.name}</h4>
            <div class="campaign-meta" style="margin-bottom:10px">
              <span class="meta-item"><i data-lucide="users"></i>${r.segment}</span>
              <span class="meta-item"><i data-lucide="calendar"></i>Próximo envío: ${r.nextSend}</span>
            </div>
            <span class="badge ${r.status==='Active'?'badge-success':r.status==='Scheduled'?'badge-info':'badge-muted'}">${r.status}</span>
          </div>
        `).join("")}
      </div>
    `;
    afterRender();
  }

  /* ===================================================================
   * 9. SALES ENABLEMENT CENTER
   * =================================================================== */
  function renderSalesEnablement(container) {
    const assets = D().assets;
    const services = D().services.concat(["General"]);
    container.innerHTML = `
      ${pageHead({
        eyebrow: "Sales Enablement Center",
        title: "Biblioteca de Habilitación Comercial",
        lede: "Scripts, emails, one-pagers, battlecards y propuestas organizadas por servicio para que Ventas cierre mejor y más rápido.",
        actions: `<button class="btn btn-primary" data-action="open-upload-asset"><i data-lucide="upload"></i>Agregar Asset</button>`
      })}
      ${UI().filterBar({ scope: "enablement", searchPlaceholder: "Buscar script, email, one-pager...", selects: [{ key: "service", label: "Servicio", options: services }, { key: "type", label: "Tipo", options: D().assetTypes }], resultCount: assets.length })}
      <div id="enablementResults"></div>
    `;

    function assetCard(a) {
      return `
      <div class="card card-pad interactive">
        <div class="flex justify-between items-center" style="margin-bottom:10px">
          <span class="tag">${a.type}</span>
          <span class="badge ${a.status==='Actualizado'?'badge-success':a.status==='Nuevo'?'badge-info':'badge-warning'}">${a.status}</span>
        </div>
        <h4 style="font-size:13.5px;margin-bottom:8px;line-height:1.4">${a.title}</h4>
        <div class="campaign-meta" style="margin-bottom:10px">
          <span class="meta-item"><i data-lucide="truck"></i>${a.service}</span>
          <span class="meta-item"><i data-lucide="users"></i>${a.segment}</span>
        </div>
        <p class="text-secondary" style="font-size:12px;margin-bottom:12px">${a.recommendedUse}</p>
        <div class="flex justify-between items-center" style="padding-top:10px;border-top:1px solid var(--border)">
          <span class="text-muted" style="font-size:11px">Actualizado ${a.updatedDate}</span>
          <button class="btn btn-secondary btn-sm" data-action="open-asset-detail" data-id="${a.id}">Ver / Usar</button>
        </div>
      </div>`;
    }

    function renderResults(list) {
      container.querySelector("#enablementResults").innerHTML = `<div class="grid-cards">${list.map(assetCard).join("") || UI().emptyState({icon:"search-x", title:"Sin resultados", text:"Ajusta los filtros de búsqueda."})}</div>`;
      afterRender();
    }
    renderResults(assets);
    global.DGL_INTERACTIONS.wireFilters(container, assets, { search: ["title", "type"] }, renderResults);
    afterRender();
  }

  /* ===================================================================
   * 10. AUTOMATION PLAYBOOKS
   * =================================================================== */
  function renderPlaybooks(container) {
    const playbooks = D().playbooks;
    container.innerHTML = `
      ${pageHead({
        eyebrow: "Automation Playbooks",
        title: "Playbooks de Automatización de Marketing",
        lede: "Reglas de negocio que activan campañas y secuencias automáticamente según el comportamiento del cliente.",
        actions: `<button class="btn btn-primary" data-action="open-create-playbook"><i data-lucide="workflow"></i>Nuevo Playbook</button>`
      })}
      <div class="stack">
        ${playbooks.map(p => `
          <div class="card card-pad">
            <div class="flex justify-between items-center" style="flex-wrap:wrap;gap:10px;margin-bottom:12px">
              <h4 style="font-size:14px">${p.name}</h4>
              <span class="badge ${p.status==='Active'?'badge-success':'badge-muted'}">${p.status}</span>
            </div>
            <div class="flow-strip">
              <div class="flow-step" style="border-color:rgba(245,158,11,0.3);background:rgba(245,158,11,0.06)"><div class="flow-label">Trigger</div><div class="flow-value">${p.trigger}</div></div>
              <div class="flow-arrow"><i data-lucide="arrow-right"></i></div>
              <div class="flow-step"><div class="flow-label">Segmento</div><div class="flow-value">${p.segment}</div></div>
              <div class="flow-arrow"><i data-lucide="arrow-right"></i></div>
              <div class="flow-step" style="border-color:var(--secondary-border);background:var(--secondary-dim)"><div class="flow-label">Acción</div><div class="flow-value">${p.action}</div></div>
              <div class="flow-arrow"><i data-lucide="arrow-right"></i></div>
              <div class="flow-step"><div class="flow-label">Canal</div><div class="flow-value">${p.channel}</div></div>
            </div>
            <div class="flex gap-12" style="flex-wrap:wrap;margin-top:10px;font-size:12px">
              <span class="text-secondary"><i data-lucide="user" style="width:12px;height:12px;display:inline;vertical-align:-2px"></i> ${p.owner}</span>
              <span class="text-secondary"><i data-lucide="timer" style="width:12px;height:12px;display:inline;vertical-align:-2px"></i> ${p.executionTime}</span>
              <span class="text-secondary"><i data-lucide="target" style="width:12px;height:12px;display:inline;vertical-align:-2px"></i> KPI: ${p.kpi}</span>
            </div>
          </div>
        `).join("")}
      </div>
    `;
    afterRender();
  }

  /* ===================================================================
   * 11. CONTENT & ASSET LIBRARY
   * =================================================================== */
  function renderContentLibrary(container) {
    const assets = D().assets;
    const byType = {};
    assets.forEach(a => { byType[a.type] = (byType[a.type] || 0) + 1; });

    container.innerHTML = `
      ${pageHead({
        eyebrow: "Content & Asset Library",
        title: "Biblioteca de Contenido y Assets",
        lede: "Todo el contenido de ejecución comercial: emails, brochures, presentaciones, scripts y casos de éxito en un solo lugar.",
        actions: `<button class="btn btn-primary" data-action="open-upload-asset"><i data-lucide="folder-plus"></i>Subir Contenido</button>`
      })}
      ${sectionHeading("Distribución por Tipo de Asset")}
      <div class="grid-cards" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr));margin-bottom:8px">
        ${Object.entries(byType).map(([type, count]) => `
          <div class="card card-pad" style="text-align:center;padding:16px">
            <div style="font-size:22px;font-weight:800;color:var(--secondary)">${count}</div>
            <div class="text-secondary" style="font-size:11.5px;margin-top:4px">${type}</div>
          </div>
        `).join("")}
      </div>
      ${sectionHeading("Todos los Assets", `${assets.length} elementos`)}
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Título</th><th>Tipo</th><th>Servicio</th><th>Segmento</th><th>Estado</th><th>Actualizado</th><th></th></tr></thead>
          <tbody>
            ${assets.map(a => `
              <tr>
                <td class="cell-primary">${a.title}</td>
                <td><span class="tag">${a.type}</span></td>
                <td>${a.service}</td>
                <td class="cell-muted">${a.segment}</td>
                <td><span class="badge ${a.status==='Actualizado'?'badge-success':a.status==='Nuevo'?'badge-info':'badge-warning'}">${a.status}</span></td>
                <td class="cell-muted">${a.updatedDate}</td>
                <td><button class="btn btn-secondary btn-sm" data-action="open-asset-detail" data-id="${a.id}">Ver</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
    afterRender();
  }

  /* ===================================================================
   * 12. MARKETING ANALYTICS
   * =================================================================== */
  function renderAnalytics(container) {
    const A = D().analytics;
    container.innerHTML = `
      ${pageHead({
        eyebrow: "Marketing Analytics",
        title: "Analítica de Impacto Comercial",
        lede: "Medición del impacto real de Marketing sobre revenue, conversión y retención — no métricas de vanidad.",
        actions: `<button class="btn btn-secondary" data-action="export-report"><i data-lucide="download"></i>Exportar Reporte</button>`
      })}
      ${UI().kpiGrid([
        { icon: "dollar-sign", label: "Revenue influenciado", value: A.revenueInfluenced, format: "currency-compact", delta: A.revenueInfluencedDelta },
        { icon: "refresh-cw", label: "Cuentas reactivadas", value: A.accountsReactivated, delta: A.accountsReactivatedDelta },
        { icon: "shield-check", label: "Cuentas retenidas", value: A.accountsRetained },
        { icon: "percent", label: "ROI estimado de Marketing", value: A.roiEstimate, format: "multiplier", iconBg:"rgba(139,92,246,0.14)", iconFg:"#c9b6ff" }
      ])}
      <div style="height:16px"></div>
      ${UI().kpiGrid([
        { icon: "arrow-up-right", label: "Cross Selling generado", value: A.crossSellGenerated, format: "currency-compact" },
        { icon: "bar-chart-2", label: "Upselling generado", value: A.upsellGenerated, format: "currency-compact" },
        { icon: "file-check-2", label: "Cotizaciones recuperadas", value: A.quotesRecovered, delta: A.quotesRecoveredDelta },
        { icon: "shuffle", label: "Conversión cotización→carga", value: A.quoteToLoadConversion, format: "percent", delta: A.quoteToLoadConversionDelta }
      ])}

      <div class="grid-2" style="margin-top:26px">
        <div class="card chart-card">
          <div class="chart-head"><div><h4>Revenue Influenciado — Tendencia</h4><span class="hint">Últimos 6 meses</span></div></div>
          <div class="chart-canvas-wrap"><canvas id="chartAnalyticsRevenue"></canvas></div>
        </div>
        <div class="card card-pad">
          <div class="section-heading" style="margin-top:0"><h3>Funnel de Cartera Existente</h3><span class="hint">Cotización → Recuperación</span></div>
          <div id="funnelContainer"></div>
        </div>
      </div>

      ${sectionHeading("Conversión por Tipo de Campaña")}
      <div class="card chart-card">
        <div class="chart-canvas-wrap" style="height:240px"><canvas id="chartAnalyticsCampaigns"></canvas></div>
      </div>
    `;
    CH().revenueTrendChart("chartAnalyticsRevenue", A.monthlyRevenueTrend);
    CH().campaignPerformanceChart("chartAnalyticsCampaigns", A.campaignPerformance);
    CH().funnelBars("funnelContainer", A.funnelByStage);
    afterRender();
  }

  /* ===================================================================
   * 13. NOVA & SALESFORCE INSIGHTS
   * =================================================================== */
  function renderNovaInsights(container) {
    const N = D().novaInsights;
    container.innerHTML = `
      ${pageHead({
        eyebrow: "Nova & Salesforce Insights",
        title: "Integración Conceptual — Nova (TMS) & Salesforce (CRM)",
        lede: "Cómo Marketing usará datos operativos y comerciales en tiempo real para accionar campañas. Módulo preparado para integración futura.",
        actions: `<span class="badge badge-info">Integración futura — vista conceptual</span>`
      })}
      ${UI().kpiGrid([
        { icon: "file-text", label: "Lane Quotes abiertas", value: N.laneQuotesOpen, iconBg:"rgba(56,189,248,0.14)", iconFg:"var(--info)" },
        { icon: "x-circle", label: "Cotizaciones perdidas (30d)", value: N.quotesLostLast30d, iconBg:"rgba(239,68,68,0.14)", iconFg:"var(--danger)" },
        { icon: "package", label: "Loads promedio / cliente", value: N.loadsPerCustomerAvg },
        { icon: "clock", label: "Tiempo de respuesta promedio", value: N.avgResponseTimeHours, format: "multiplier", deltaSuffix:"h" }
      ])}

      <div class="grid-2" style="margin-top:24px">
        <div class="card chart-card">
          <div class="chart-head"><div><h4>Servicios Más Solicitados</h4><span class="hint">Volumen de Lane Quotes por servicio</span></div></div>
          <div class="chart-canvas-wrap"><canvas id="chartServiceVolume"></canvas></div>
        </div>
        <div class="card chart-card">
          <div class="chart-head"><div><h4>Motivos de Pérdida de Cotización</h4><span class="hint">Últimos 30 días</span></div></div>
          <div class="chart-canvas-wrap"><canvas id="chartLossReasons"></canvas></div>
        </div>
      </div>

      <div class="grid-2" style="margin-top:16px">
        <div class="card card-pad">
          <h4 style="font-size:13.5px;margin-bottom:10px"><i data-lucide="trending-down" style="width:14px;height:14px;display:inline;vertical-align:-2px;color:var(--warning)"></i> Clientes con Caída de Volumen</h4>
          <ul style="display:flex;flex-direction:column;gap:8px">
            ${N.volumeDropAccounts.map(a => `<li class="flex items-center gap-8" style="font-size:12.5px"><i data-lucide="arrow-down-right" style="width:13px;height:13px;color:var(--danger)"></i>${a}</li>`).join("")}
          </ul>
        </div>
        <div class="card card-pad">
          <h4 style="font-size:13.5px;margin-bottom:10px"><i data-lucide="trending-up" style="width:14px;height:14px;display:inline;vertical-align:-2px;color:var(--secondary)"></i> Clientes con Oportunidad de Crecimiento</h4>
          <ul style="display:flex;flex-direction:column;gap:8px">
            ${N.growthOpportunityAccounts.map(a => `<li class="flex items-center gap-8" style="font-size:12.5px"><i data-lucide="arrow-up-right" style="width:13px;height:13px;color:var(--secondary)"></i>${a}</li>`).join("")}
          </ul>
        </div>
      </div>
    `;
    CH().serviceVolumeBar("chartServiceVolume", N.topRequestedServices);
    CH().lossReasonsDonut("chartLossReasons", N.lossReasons);
    afterRender();
  }

  /* ===================================================================
   * 14. BUSINESS INTELLIGENCE FOR MARKETING
   * =================================================================== */
  function renderBusinessIntelligence(container) {
    const items = D().biIntel;
    container.innerHTML = `
      ${pageHead({
        eyebrow: "Business Intelligence",
        title: "Inteligencia de Negocio para Marketing",
        lede: "Tendencias logísticas, nearshoring y movimientos de mercado que alimentan campañas y argumentos comerciales — módulo de apoyo, no el centro del sistema.",
      })}
      <div class="stack">
        ${items.map(i => `
          <div class="card card-pad">
            <div class="flex justify-between items-center" style="margin-bottom:8px;flex-wrap:wrap;gap:8px">
              <span class="tag">${i.category}</span>
              <span class="badge ${i.relevance==='Alta'?'badge-warning':'badge-muted'}">Relevancia ${i.relevance}</span>
            </div>
            <h4 style="font-size:14px;margin-bottom:6px">${i.title}</h4>
            <p class="text-secondary" style="font-size:12.5px;margin-bottom:8px"><i data-lucide="lightbulb" style="width:13px;height:13px;display:inline;vertical-align:-2px;color:var(--secondary)"></i> ${i.impact}</p>
            <span class="text-muted" style="font-size:11px">${i.date}</span>
          </div>
        `).join("")}
      </div>
    `;
    afterRender();
  }

  /* ===================================================================
   * 15. SEO / GEO INTELLIGENCE
   * =================================================================== */
  function renderSeoGeo(container) {
    const S = D().seoGeo;
    container.innerHTML = `
      ${pageHead({
        eyebrow: "SEO / GEO Intelligence",
        title: "Posicionamiento Orgánico y en Motores de IA",
        lede: "Visibilidad de DGL en búsqueda tradicional y en respuestas generadas por IA — módulo de apoyo a ventas y autoridad de marca.",
      })}
      ${UI().kpiGrid([
        { icon: "search", label: "Visibilidad Orgánica", value: S.organicVisibility, format: "percent" },
        { icon: "sparkles", label: "Visibilidad en IA (AEO/GEO)", value: S.aiVisibility, format: "percent", iconBg:"rgba(139,92,246,0.14)", iconFg:"#c9b6ff" },
        { icon: "file-search", label: "Keywords estratégicas monitoreadas", value: S.strategicKeywords.length },
        { icon: "layout", label: "Páginas críticas", value: S.criticalPages.length }
      ])}
      <div class="grid-2" style="margin-top:24px">
        <div class="card chart-card">
          <div class="chart-head"><div><h4>Visibilidad por Keyword Estratégica</h4></div></div>
          <div class="chart-canvas-wrap"><canvas id="chartKeywords"></canvas></div>
        </div>
        <div class="card card-pad">
          <div class="section-heading" style="margin-top:0"><h3>Páginas Críticas</h3></div>
          <div class="action-list">
            ${S.criticalPages.map(p => `
              <div class="action-row">
                <div class="action-priority ${p.priority==='Alta'?'critical':'medium'}"></div>
                <div class="action-text">${p.page}<div class="action-meta">Prioridad ${p.priority}</div></div>
                <span class="badge ${p.status==='Optimizada'?'badge-success':p.status==='En progreso'?'badge-info':'badge-warning'}">${p.status}</span>
              </div>
            `).join("")}
          </div>
          <div class="divider"></div>
          <div class="section-heading" style="margin-top:0"><h3>Recomendaciones de Contenido</h3></div>
          <ul style="display:flex;flex-direction:column;gap:8px">
            ${S.contentRecommendations.map(r => `<li style="font-size:12.5px" class="flex gap-8"><i data-lucide="check-circle-2" style="width:14px;height:14px;color:var(--secondary);flex-shrink:0"></i>${r}</li>`).join("")}
          </ul>
        </div>
      </div>
    `;
    CH().keywordVisibilityBar("chartKeywords", S.strategicKeywords);
    afterRender();
  }

  /* ===================================================================
   * 16. GOVERNANCE & APPROVALS
   * =================================================================== */
  function renderGovernance(container) {
    const gov = D().governance;
    container.innerHTML = `
      ${pageHead({
        eyebrow: "Governance & Approvals",
        title: "Gobierno y Aprobación de Campañas",
        lede: "Control de calidad, branding y compliance antes de publicar cualquier campaña o comunicación.",
      })}
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Campaña</th><th>Estado</th><th>Branding</th><th>Legal</th><th>QA</th><th>Responsable</th><th>Publicación</th><th>Canal</th></tr></thead>
          <tbody>
            ${gov.map(g => `
              <tr>
                <td class="cell-primary">${g.campaign}</td>
                <td><span class="badge ${g.status==='Aprobada'?'badge-success':g.status==='En revisión'?'badge-warning':'badge-muted'}">${g.status}</span></td>
                <td>${g.checklist.branding ? '<i data-lucide="check-circle-2" style="color:var(--secondary);width:16px;height:16px"></i>' : '<i data-lucide="circle" style="color:var(--muted);width:16px;height:16px"></i>'}</td>
                <td>${g.checklist.legal ? '<i data-lucide="check-circle-2" style="color:var(--secondary);width:16px;height:16px"></i>' : '<i data-lucide="circle" style="color:var(--muted);width:16px;height:16px"></i>'}</td>
                <td>${g.checklist.qa ? '<i data-lucide="check-circle-2" style="color:var(--secondary);width:16px;height:16px"></i>' : '<i data-lucide="circle" style="color:var(--muted);width:16px;height:16px"></i>'}</td>
                <td>${g.owner}</td>
                <td class="cell-muted">${g.publishDate}</td>
                <td><span class="tag">${g.channel}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
    afterRender();
  }

  /* ---------------------------------------------------------------
   * REGISTRY
   * --------------------------------------------------------------- */
  global.DGL_MODULE_RENDERERS = {
    "command-center": renderCommandCenter,
    "campaign-execution": renderCampaignExecution,
    "email-marketing": renderEmailMarketing,
    "quoted-not-booked": renderQuotedNotBooked,
    "reactivation": renderReactivation,
    "growth": renderGrowth,
    "abm": renderABM,
    "retention": renderRetention,
    "sales-enablement": renderSalesEnablement,
    "automation-playbooks": renderPlaybooks,
    "content-library": renderContentLibrary,
    "analytics": renderAnalytics,
    "nova-insights": renderNovaInsights,
    "business-intelligence": renderBusinessIntelligence,
    "seo-geo": renderSeoGeo,
    "governance": renderGovernance
  };

  global.DGL_MODULE_HELPERS = { statusBadge, tierBadge, money, scoreRing, sampleFlag };
})(window);
