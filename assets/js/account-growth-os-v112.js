(function (global) {
  "use strict";

  const SERVICES = ["FTL","LTL","Drayage","Intermodal","Cross Border","Warehousing","Transloading","HazMat","Refrigerated","Flatbed","Oversize"];
  const D = () => global.DGL_DATA || {};
  const UI = () => global.DGL_UI || {};
  const clone = (v) => JSON.parse(JSON.stringify(v || []));
  const SAMPLE_CUSTOMERS = clone(D().customers);
  const SAMPLE_QUOTES = clone(D().quotedNotBooked);
  const ACTIONABLE_THRESHOLD = 68;
  const SCORING_VERSION = "1.1.2";

  function n(v) { return Number(v || 0); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function money(v) { return "$" + Math.round(n(v)).toLocaleString("en-US"); }
  function compact(v) {
    const value = n(v);
    if (value >= 1000000) return "$" + (value / 1000000).toFixed(1) + "M";
    if (value >= 1000) return "$" + Math.round(value / 1000) + "K";
    return money(value);
  }
  function daysSince(dateValue) {
    if (!dateValue) return 999;
    const d = new Date(dateValue + "T12:00:00");
    if (Number.isNaN(d.getTime())) return 999;
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
  }
  function quoteSource() {
    return Array.isArray(D().quotedNotBooked) && D().quotedNotBooked.length ? D().quotedNotBooked : SAMPLE_QUOTES;
  }
  function quotesFor(account) {
    return quoteSource().filter((q) => q.customerId === account.id || q.customer === account.name);
  }
  function tierWeight(tier) {
    return tier === "Strategic" ? 100 : tier === "Key" ? 75 : 45;
  }
  function statusRisk(status) {
    const s = String(status || "").toLowerCase();
    if (s.includes("dormant") || s.includes("120")) return 100;
    if (s.includes("90")) return 92;
    if (s.includes("60")) return 82;
    if (s.includes("risk")) return 78;
    if (s.includes("30")) return 62;
    if (s.includes("quoted")) return 68;
    return 18;
  }

  function inactivityScore(days) {
    if (days <= 14) return 8;
    if (days <= 30) return 22;
    if (days <= 45) return 42;
    if (days <= 60) return 62;
    if (days <= 90) return 82;
    return 100;
  }

  function quoteAgeScore(days) {
    if (days <= 14) return 100;
    if (days <= 30) return 88;
    if (days <= 60) return 72;
    if (days <= 90) return 55;
    if (days <= 120) return 40;
    return 25;
  }

  function quoteProbabilityScore(quotes) {
    if (!quotes.length) return 0;
    const map = { alta: 100, media: 72, baja: 38 };
    const total = quotes.reduce((sum, q) => sum + (map[String(q.recoveryProbability || "media").toLowerCase()] || 60), 0);
    return total / quotes.length;
  }

  function isActionable(account) {
    return account.scores.priority >= ACTIONABLE_THRESHOLD ||
      account.scores.quoteRecovery >= 58 ||
      account.scores.reactivation >= 72 ||
      account.scores.retentionRisk >= 72;
  }

  function enrichAccount(raw) {
    const q = quotesFor(raw);
    const services = Array.isArray(raw.servicesUsed) ? raw.servicesUsed : String(raw.servicesUsed || "").split(",").map((x) => x.trim()).filter(Boolean);
    const daysLoad = raw.lastLoadDate ? daysSince(raw.lastLoadDate) : n(raw.daysSinceLastLoad || 999);
    const daysQuote = raw.lastQuoteDate ? daysSince(raw.lastQuoteDate) : 999;
    const historic = n(raw.revenueHistoric);
    const ytd = n(raw.revenueYTD);
    const loads90 = n(raw.loadsLast90d);

    const inactivity = inactivityScore(daysLoad);
    const valueScore = clamp((historic / 1000000) * 100, 0, 100);
    const quoteAge = quoteAgeScore(daysQuote);
    const probability = quoteProbabilityScore(q);
    const quoteIntent = q.length
      ? clamp(35 + q.length * 15 + (daysQuote <= 30 ? 25 : daysQuote <= 60 ? 15 : daysQuote <= 90 ? 8 : 0), 0, 100)
      : (daysQuote <= 14 ? 28 : daysQuote <= 30 ? 14 : 0);
    const riskBase = statusRisk(raw.status);
    const crossSell = clamp(((SERVICES.length - services.length) / SERVICES.length) * 100, 0, 100);
    const tier = tierWeight(raw.tier);
    const activeBonus = String(raw.status || "").toLowerCase() === "active" ? 10 : 0;
    const inactiveStatusBonus = /inactive|dormant/i.test(String(raw.status || "")) ? 10 : 0;

    const reactivation = Math.round(clamp(
      inactivity * .45 + valueScore * .20 + tier * .15 + (loads90 === 0 ? 15 : 5) + inactiveStatusBonus,
      0, 100
    ));

    const recovery = q.length ? Math.round(clamp(
      probability * .35 + quoteAge * .25 + valueScore * .15 + tier * .15 + quoteIntent * .10,
      0, 100
    )) : 0;

    const retention = Math.round(clamp(
      riskBase * .45 + inactivity * .25 + valueScore * .15 + tier * .15,
      0, 100
    ));

    const growth = Math.round(clamp(
      crossSell * .40 + valueScore * .30 + tier * .20 + activeBonus,
      0, 100
    ));

    const specializedUrgency = Math.max(reactivation, recovery, retention, growth * .85);
    const priority = Math.round(clamp(
      specializedUrgency * .65 + valueScore * .12 + tier * .10 + quoteIntent * .08 + riskBase * .05,
      0, 100
    ));

    const staleInactiveQuote = daysLoad >= 60 && daysQuote > 60;
    let actionType = "GROWTH";
    if (q.length && recovery >= 55 && !staleInactiveQuote) actionType = "QUOTE_RECOVERY";
    else if (retention >= 70 && daysLoad < 60) actionType = "RETENTION";
    else if (daysLoad >= 45 || reactivation >= 70) actionType = "REACTIVATION";
    else if (services.length <= 1) actionType = "CROSS_SELL";

    const labels = {
      QUOTE_RECOVERY: "Recuperar cotización",
      RETENTION: "Proteger cuenta",
      REACTIVATION: "Reactivar cuenta",
      CROSS_SELL: "Expandir servicios",
      GROWTH: "Crecer cuenta"
    };

    const signals = [];
    if (daysLoad >= 45) signals.push("Sin carga en " + daysLoad + " días");
    if (q.length) signals.push(q.length + " cotización(es) QNB detectada(s)");
    if (q.length && daysQuote <= 60) signals.push("Intención comercial reciente: cotizó hace " + daysQuote + " días");
    if (services.length <= 1) signals.push("Penetración de servicio baja: " + (services[0] || "sin servicio registrado"));
    if (riskBase >= 70) signals.push("Señal de riesgo comercial por estado de cuenta");
    if (historic >= 500000) signals.push("Cuenta de alto valor histórico");
    if (!signals.length) signals.push("Cuenta estable con oportunidad de expansión");

    const monthlyBase = historic > 0 ? historic / 18 : Math.max(ytd / 8, 5000);
    const opportunityMultiplier = priority >= 80 ? 2.5 : priority >= ACTIONABLE_THRESHOLD ? 1.8 : priority >= 55 ? 1.15 : .65;
    const opportunityValue = Math.max(0, Math.round(monthlyBase * opportunityMultiplier));
    const revenueAtRisk = retention >= 70 ? Math.round(Math.max(ytd * .25, monthlyBase * 2)) : 0;
    const availableServices = SERVICES.filter((svc) => !services.includes(svc));

    const enriched = Object.assign({}, raw, {
      servicesUsed: services,
      availableServices,
      liveDaysSinceLastLoad: daysLoad,
      daysSinceLastQuote: daysQuote,
      quoteCountOpen: q.length,
      scores: { priority, reactivation, quoteRecovery: recovery, retentionRisk: retention, growth },
      signals,
      opportunityValue,
      revenueAtRisk,
      nextBestAction: {
        type: actionType,
        label: labels[actionType],
        reason: signals[0],
        owner: raw.accountManager || "Account Management",
        recommendedService: raw.recommendedService || availableServices[0] || "FTL"
      }
    });
    enriched.actionable = isActionable(enriched);
    return enriched;
  }

  function getAccounts() {
    const source = Array.isArray(D().customers) && D().customers.length ? D().customers : SAMPLE_CUSTOMERS;
    return source.map(enrichAccount).sort((a, b) => b.scores.priority - a.scores.priority);
  }

  function riskClass(score) {
    if (score >= 80) return "badge-danger";
    if (score >= 68) return "badge-warning";
    if (score >= 55) return "badge-info";
    return "badge-muted";
  }
  function priorityLabel(score) {
    if (score >= 80) return "URGENTE";
    if (score >= 68) return "ALTA";
    if (score >= 55) return "MEDIA";
    return "MONITOREAR";
  }
  function pageHead(title, lede, eyebrow) {
    return `<div class="page-head"><div><div class="eyebrow">${eyebrow || "Account Growth"}</div><h2>${title}</h2><p class="lede">${lede}</p></div><div class="page-head-actions"><span class="badge badge-success">ACCOUNT-LED · V${SCORING_VERSION}</span></div></div>`;
  }
  function scorePill(label, score) {
    return `<div class="card card-pad" style="min-width:150px"><div class="text-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.08em">${label}</div><div style="font-size:28px;font-weight:800;margin-top:5px">${score}<span class="text-muted" style="font-size:12px;font-weight:600"> / 100</span></div></div>`;
  }
  function actionBadge(type) {
    const map = { QUOTE_RECOVERY:"badge-info", RETENTION:"badge-warning", REACTIVATION:"badge-danger", CROSS_SELL:"badge-success", GROWTH:"badge-success" };
    return `<span class="badge ${map[type] || "badge-muted"}">${String(type).replaceAll("_", " ")}</span>`;
  }

  function priorityRows(accounts, limit) {
    return accounts.slice(0, limit || 12).map((a) => `
      <tr>
        <td><div style="display:flex;align-items:center;gap:9px"><strong style="font-size:17px">${a.scores.priority}</strong><span class="badge ${riskClass(a.scores.priority)}">${priorityLabel(a.scores.priority)}</span></div></td>
        <td><strong>${a.name}</strong><div class="text-muted" style="font-size:11px">${a.industry || ""} · ${a.accountManager || "Sin AM"}</div></td>
        <td>${a.signals[0]}</td>
        <td>${actionBadge(a.nextBestAction.type)}</td>
        <td><strong>${compact(a.opportunityValue)}</strong><div class="text-muted" style="font-size:10px">estimado</div></td>
        <td><button class="btn btn-sm" data-ag-open-account="${a.id}">Abrir Account 360</button></td>
      </tr>`).join("");
  }

  function renderCommandCenter(container) {
    const accounts = getAccounts();
    const actionable = accounts.filter((a) => a.actionable);
    const exposed = accounts.reduce((sum, a) => sum + a.revenueAtRisk, 0);
    const opportunity = actionable.reduce((sum, a) => sum + a.opportunityValue, 0);
    const reactivation = accounts.filter((a) => a.nextBestAction.type === "REACTIVATION").length;
    const recover = accounts.filter((a) => a.nextBestAction.type === "QUOTE_RECOVERY").length;
    const influenced = n(D().analytics && D().analytics.revenueInfluenced);

    container.innerHTML = `
      ${pageHead("DGL Account Growth Command Center", "Marketing prioriza, activa y mide oportunidades dentro de la cartera existente. La vista principal responde dónde actuar hoy y qué impacto económico está en juego.", "Revenue Operations")}
      ${UI().kpiGrid ? UI().kpiGrid([
        { icon:"dollar-sign", label:"Marketing Influenced Revenue", value: influenced, format:"currency-compact", foot:"Revenue atribuido / influenciado" },
        { icon:"target", label:"Revenue Opportunity", value: opportunity, format:"currency-compact", foot:"Estimación sobre cuentas prioritarias" },
        { icon:"shield-alert", label:"Revenue Expuesto", value: exposed, format:"currency-compact", foot:"Estimación sobre cuentas con riesgo" },
        { icon:"zap", label:"Cuentas para actuar hoy", value: actionable.length, foot:"Urgent/High o señal especializada crítica" }
      ]) : ""}
      <div class="grid-2" style="margin-top:24px">
        <div class="card card-pad"><div class="eyebrow">REACTIVATION</div><div style="font-size:34px;font-weight:800;margin-top:5px">${reactivation}</div><div class="text-secondary">cuentas con reactivación como Next Best Action</div></div>
        <div class="card card-pad"><div class="eyebrow">QUOTE RECOVERY</div><div style="font-size:34px;font-weight:800;margin-top:5px">${recover}</div><div class="text-secondary">cuentas con cotización recuperable prioritaria</div></div>
      </div>
      <div class="section-heading" style="margin-top:28px"><h3>Today's Revenue Priority Queue</h3><span class="hint">Ordenado por Account Priority Score</span></div>
      <div class="card" style="overflow:auto"><table class="data-table"><thead><tr><th>Score</th><th>Cuenta</th><th>Señal principal</th><th>Next Best Action</th><th>Oportunidad</th><th></th></tr></thead><tbody>${priorityRows(accounts, 8)}</tbody></table></div>
      <div class="section-heading" style="margin-top:28px"><h3>Marketing Impact by Department</h3><span class="hint">Cómo Marketing traduce señales en soporte operativo</span></div>
      <div class="grid-2">
        <div class="card card-pad"><h4>Sales / Account Management</h4><p class="text-secondary" style="margin-top:8px">${actionable.length} cuentas priorizadas · ${reactivation} oportunidades de reactivación · ${recover} cotizaciones para recuperar.</p></div>
        <div class="card card-pad"><h4>Pricing</h4><p class="text-secondary" style="margin-top:8px">${accounts.filter(a=>a.quoteCountOpen>0).length} cuentas con señales de quote activity para revisar conversión, precio y recurrencia.</p></div>
        <div class="card card-pad"><h4>Operations / Customer Service</h4><p class="text-secondary" style="margin-top:8px">${accounts.filter(a=>a.scores.retentionRisk>=65).length} cuentas requieren intervención preventiva o seguimiento de experiencia.</p></div>
        <div class="card card-pad"><h4>Management</h4><p class="text-secondary" style="margin-top:8px">${compact(opportunity)} de oportunidad estimada y ${compact(exposed)} de revenue expuesto para priorización ejecutiva.</p></div>
      </div>`;
    if (global.lucide) global.lucide.createIcons();
  }

  function renderPriorityQueue(container) {
    const accounts = getAccounts();
    const high = accounts.filter((a) => a.actionable);
    const opp = high.reduce((s, a) => s + a.opportunityValue, 0);
    const risk = accounts.reduce((s, a) => s + a.revenueAtRisk, 0);
    const qnb = accounts.filter((a) => a.quoteCountOpen > 0).length;
    container.innerHTML = `
      ${pageHead("Account Priority Queue", "Lista diaria de cuentas ordenadas por probabilidad de impacto. Marketing deja de trabajar por volumen de tareas y empieza a trabajar por prioridad económica.", "Accounts")}
      ${UI().kpiGrid ? UI().kpiGrid([
        {icon:"flame",label:"Actionable Today",value:high.length,foot:"Urgent/High o señal crítica"},
        {icon:"circle-dollar-sign",label:"Opportunity",value:opp,format:"currency-compact",foot:"Estimación cuentas accionables"},
        {icon:"shield-alert",label:"Revenue Expuesto",value:risk,format:"currency-compact",foot:"Estimación de riesgo"},
        {icon:"file-warning",label:"Accounts with QNB",value:qnb,foot:"Cotizaciones abiertas / no convertidas"}
      ]) : ""}
      <div class="card" style="overflow:auto;margin-top:24px"><table class="data-table"><thead><tr><th>Score</th><th>Cuenta</th><th>Señal</th><th>Next Best Action</th><th>Opportunity</th><th></th></tr></thead><tbody>${priorityRows(accounts, 50)}</tbody></table></div>`;
    if (global.lucide) global.lucide.createIcons();
  }

  function renderAccount360(container) {
    const accounts = getAccounts();
    const selectedId = sessionStorage.getItem("dgl_selected_account") || (accounts[0] && accounts[0].id);
    const a = accounts.find((x) => x.id === selectedId) || accounts[0];
    if (!a) { container.innerHTML = pageHead("Account 360", "No hay cuentas disponibles.", "Accounts"); return; }
    const optionHtml = accounts.map((x) => `<option value="${x.id}" ${x.id===a.id?"selected":""}>${x.name}</option>`).join("");
    const serviceHtml = SERVICES.map((s) => `<div class="card card-pad" style="padding:12px"><div style="font-size:12px;font-weight:700">${s}</div><div class="text-muted" style="font-size:10px;margin-top:4px">${a.servicesUsed.includes(s) ? "ACTIVE" : (s===a.nextBestAction.recommendedService ? "RECOMMENDED" : "OPPORTUNITY")}</div></div>`).join("");
    const q = quotesFor(a);
    container.innerHTML = `
      ${pageHead("Account 360", "Vista única de actividad, riesgo, potencial y siguiente mejor acción para cada cuenta.", "Accounts")}
      <div class="card card-pad" style="margin-bottom:20px;display:flex;justify-content:space-between;gap:20px;align-items:flex-end;flex-wrap:wrap">
        <div><div class="eyebrow">SELECT ACCOUNT</div><select id="agAccountSelect" class="input" style="min-width:320px;margin-top:7px">${optionHtml}</select></div>
        <div><span class="badge ${riskClass(a.scores.priority)}">PRIORITY ${a.scores.priority}</span> ${actionBadge(a.nextBestAction.type)}</div>
      </div>
      <div class="card card-pad" style="margin-bottom:20px">
        <div class="flex justify-between items-center" style="gap:16px;flex-wrap:wrap"><div><h2 style="font-size:25px">${a.name}</h2><div class="text-secondary" style="margin-top:4px">${a.industry || ""} · ${a.tier || ""} · AM: ${a.accountManager || "Sin asignar"}</div></div><div style="font-size:28px;font-weight:800">${compact(a.revenueHistoric)}<div class="text-muted" style="font-size:10px;font-weight:600">HISTORICAL REVENUE</div></div></div>
      </div>
      <div style="display:flex;gap:12px;overflow:auto;margin-bottom:20px">${scorePill("Priority",a.scores.priority)}${scorePill("Reactivation",a.scores.reactivation)}${scorePill("Quote Recovery",a.scores.quoteRecovery)}${scorePill("Retention Risk",a.scores.retentionRisk)}${scorePill("Growth",a.scores.growth)}</div>
      <div class="grid-2">
        <div class="card card-pad"><h3>Commercial Activity</h3><div class="stack" style="margin-top:14px">
          <div class="flex justify-between"><span class="text-secondary">Last Load</span><strong>${a.liveDaysSinceLastLoad} days</strong></div>
          <div class="flex justify-between"><span class="text-secondary">Last Quote</span><strong>${a.daysSinceLastQuote} days</strong></div>
          <div class="flex justify-between"><span class="text-secondary">Loads 90d</span><strong>${n(a.loadsLast90d)}</strong></div>
          <div class="flex justify-between"><span class="text-secondary">Open / QNB Quotes</span><strong>${q.length}</strong></div>
          <div class="flex justify-between"><span class="text-secondary">Revenue YTD</span><strong>${money(a.revenueYTD)}</strong></div>
          <div class="flex justify-between"><span class="text-secondary">Revenue Expuesto</span><strong>${money(a.revenueAtRisk)}</strong></div>
        </div></div>
        <div class="card card-pad"><h3>Signals</h3><div class="stack" style="margin-top:14px">${a.signals.map((s)=>`<div style="display:flex;gap:8px"><span style="color:var(--secondary)">●</span><span class="text-secondary">${s}</span></div>`).join("")}</div></div>
      </div>
      <div class="section-heading" style="margin-top:26px"><h3>Service Penetration</h3><span class="hint">Active vs. expansion opportunity</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:10px">${serviceHtml}</div>
      <div class="section-heading" style="margin-top:26px"><h3>Next Best Action</h3><span class="hint">Regla comercial basada en señales y score</span></div>
      <div class="card card-pad" style="border-color:rgba(119,184,42,.35)">
        <div class="eyebrow">${a.nextBestAction.type}</div><h3 style="font-size:20px;margin-top:6px">${a.nextBestAction.label}</h3>
        <p class="text-secondary" style="margin-top:8px">${a.nextBestAction.reason}. Servicio recomendado: <strong>${a.nextBestAction.recommendedService}</strong>. Owner sugerido: <strong>${a.nextBestAction.owner}</strong>.</p>
        <div class="flex gap-8" style="margin-top:16px;flex-wrap:wrap"><button class="btn btn-primary" data-ag-copy-brief="${a.id}">Copiar Account Brief</button><button class="btn" data-ag-create-task="${a.id}">Crear tarea para AM</button></div>
      </div>`;
    if (global.lucide) global.lucide.createIcons();
  }

  function accountBrief(a) {
    return ["DGL ACCOUNT BRIEF — " + a.name,"Priority Score: " + a.scores.priority + "/100","Status: " + (a.status || "N/A"),"Last Load: " + a.liveDaysSinceLastLoad + " days","Open/QNB Quotes: " + a.quoteCountOpen,"Historical Revenue: " + money(a.revenueHistoric),"Signals: " + a.signals.join(" | "),"Next Best Action: " + a.nextBestAction.label,"Reason: " + a.nextBestAction.reason,"Recommended Service: " + a.nextBestAction.recommendedService,"Owner: " + a.nextBestAction.owner].join("\n");
  }

  async function refreshLiveAccounts() {
    if (!global.DGL_API || typeof global.DGL_API.list !== "function") return false;
    try {
      const results = await Promise.allSettled([global.DGL_API.list("customers"),global.DGL_API.list("quotes")]);
      if (results[0].status === "fulfilled" && Array.isArray(results[0].value) && results[0].value.length) D().customers = results[0].value;
      if (results[1].status === "fulfilled" && Array.isArray(results[1].value) && results[1].value.length) D().quotedNotBooked = results[1].value;
      const route = location.hash.replace("#/", "").trim();
      if (["command-center","priority-queue","account-360"].includes(route)) {
        const mount = document.getElementById("mainContent");
        if (mount && global.DGL_MODULE_RENDERERS && global.DGL_MODULE_RENDERERS[route]) global.DGL_MODULE_RENDERERS[route](mount, true);
      }
      return true;
    } catch (_) { return false; }
  }

  document.addEventListener("click", async function (event) {
    const open = event.target.closest("[data-ag-open-account]");
    if (open) { sessionStorage.setItem("dgl_selected_account", open.dataset.agOpenAccount); location.hash = "#/account-360"; return; }
    const copy = event.target.closest("[data-ag-copy-brief]");
    if (copy) {
      const a = getAccounts().find((x) => x.id === copy.dataset.agCopyBrief);
      if (a) { await navigator.clipboard.writeText(accountBrief(a)); if (global.DGL_INTERACTIONS && global.DGL_INTERACTIONS.toast) global.DGL_INTERACTIONS.toast("Account Brief copiado."); }
      return;
    }
    const task = event.target.closest("[data-ag-create-task]");
    if (task) {
      const a = getAccounts().find((x) => x.id === task.dataset.agCreateTask);
      if (!a || !global.DGL_API || !global.DGL_API.upsert) return;
      try {
        await global.DGL_API.upsert("campaignTasks", {id:"AG-"+Date.now().toString(36).toUpperCase(),title:a.nextBestAction.label+" · "+a.name,owner:a.accountManager||"Account Management",dueDate:new Date().toISOString().slice(0,10),priority:a.scores.priority>=90?"Crítica":"Alta",status:"Pending",sourceType:"Account Growth OS",sourceId:a.id,notes:a.nextBestAction.reason+" | Priority Score: "+a.scores.priority});
        if (global.DGL_INTERACTIONS && global.DGL_INTERACTIONS.toast) global.DGL_INTERACTIONS.toast("Tarea creada para Account Management.");
      } catch (_) { if (global.DGL_INTERACTIONS && global.DGL_INTERACTIONS.toast) global.DGL_INTERACTIONS.toast("Conecta Apps Script para crear la tarea.", "error"); }
    }
  });

  document.addEventListener("change", function (event) {
    if (event.target && event.target.id === "agAccountSelect") { sessionStorage.setItem("dgl_selected_account", event.target.value); renderAccount360(document.getElementById("mainContent")); }
  });

  global.DGL_MODULE_RENDERERS = global.DGL_MODULE_RENDERERS || {};
  global.DGL_MODULE_RENDERERS["command-center"] = renderCommandCenter;
  global.DGL_MODULE_RENDERERS["priority-queue"] = renderPriorityQueue;
  global.DGL_MODULE_RENDERERS["account-360"] = renderAccount360;
  global.DGL_ACCOUNT_GROWTH = { getAccounts, enrichAccount, isActionable, refreshLiveAccounts, renderCommandCenter, renderPriorityQueue, renderAccount360, SCORING_VERSION };

  document.addEventListener("DOMContentLoaded", function () {
    setTimeout(refreshLiveAccounts, 1400);
    setTimeout(refreshLiveAccounts, 3800);
  });
})(window);
