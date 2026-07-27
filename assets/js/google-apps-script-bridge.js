(function (global) {
  "use strict";

  const ENDPOINT = "https://script.google.com/macros/s/AKfycbz48XbgUkg4cNexwhzvXvN9lJsr9D0s4DUz5zzyO5wmIh1z5BRZHZVABO1EiBC_wcG0/exec";
  const KEY_NAME = "dgl_gas_api_key_session";
  const D = () => global.DGL_DATA;
  let live = false;

  function key() { return sessionStorage.getItem(KEY_NAME) || ""; }
  function today() { return new Date().toISOString().slice(0, 10); }
  function plusDays(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }
  function uid(prefix) {
    return prefix + "-" + Date.now().toString(36).toUpperCase() +
      Math.random().toString(36).slice(2, 6).toUpperCase();
  }
  function parseList(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (_) {
      return String(value).split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  function toast(message, type) {
    if (global.DGL_INTERACTIONS && global.DGL_INTERACTIONS.toast) {
      global.DGL_INTERACTIONS.toast(message, type);
    }
  }
  function closeModal() {
    if (global.DGL_UI && global.DGL_UI.closeModal) global.DGL_UI.closeModal();
  }

  function jsonp(action, payload, needsKey) {
    return new Promise((resolve, reject) => {
      const apiKey = key();
      if (needsKey !== false && !apiKey) {
        reject(new Error("API_KEY_REQUIRED"));
        return;
      }

      const callbackName = "__dglGasCb" + Date.now() + Math.random().toString(36).slice(2);
      const parameters = new URLSearchParams({ action, callback: callbackName });

      if (needsKey !== false) parameters.set("apiKey", apiKey);

      Object.keys(payload || {}).forEach((name) => {
        const value = payload[name];
        if (value === undefined || value === null) return;
        parameters.set(name, typeof value === "object" ? JSON.stringify(value) : String(value));
      });

      const script = document.createElement("script");
      const timer = setTimeout(() => finish(new Error("Tiempo de conexión agotado")), 20000);

      function finish(error, result) {
        clearTimeout(timer);
        try { delete global[callbackName]; } catch (_) { global[callbackName] = undefined; }
        script.remove();
        error ? reject(error) : resolve(result);
      }

      global[callbackName] = (response) => {
        if (response && response.ok) finish(null, response.result);
        else finish(new Error(response && response.error ? response.error : "Error de Apps Script"));
      };

      script.onerror = () => finish(
        new Error("No se pudo acceder a Apps Script. Revisa los permisos de la implementación.")
      );
      script.src = ENDPOINT + "?" + parameters.toString();
      document.head.appendChild(script);
    });
  }

  async function ensureKey() {
    if (key()) return true;
    const entered = global.prompt(
      "Pega la DGL_API_KEY. Se guardará solo durante esta pestaña y no se publicará en GitHub."
    );
    if (!entered || !entered.trim()) return false;
    sessionStorage.setItem(KEY_NAME, entered.trim());
    return true;
  }

  function replaceArray(name, values) {
    if (!D()) return;
    if (Array.isArray(D()[name])) {
      D()[name].length = 0;
      values.forEach((value) => D()[name].push(value));
    } else {
      D()[name] = values;
    }
  }

  function mapCampaign(campaign) {
    return Object.assign({}, campaign, {
      cta: campaign.cta || "Ver Campaña",
      approvalStatus: campaign.approvalStatus || "Pendiente",
      dueDate: campaign.dueDate || campaign.endDate || "",
      emailsSent: Number(campaign.emailsSent || campaign.sent || 0),
      responsesLogged: Number(campaign.responsesLogged || campaign.replies || 0),
      audienceCount: Number(campaign.audienceCount || 0),
      taskCount: Number(campaign.taskCount || 0)
    });
  }

  function mapSequenceRows(rows) {
    const groups = {};

    rows.forEach((row) => {
      const groupKey = row.name || row.id;

      if (!groups[groupKey]) {
        groups[groupKey] = {
          id: row.id,
          name: row.name,
          trigger: row.trigger,
          segment: row.segment,
          status: row.status,
          metrics: { sent: 0, openRate: 0, replyRate: 0 },
          emails: []
        };
      }

      groups[groupKey].emails.push({
        step: Number(row.step || 1),
        timing: Number(row.delayHours || 0) ? "+" + row.delayHours + "h" : "Inmediato",
        subject: row.subject || "Sin asunto",
        preheader: row.preheader || ""
      });
    });

    return Object.values(groups);
  }

  function rerender() {
    const moduleId = location.hash.replace("#/", "").trim() || "command-center";
    const mount = document.getElementById("mainContent");

    if (
      mount &&
      global.DGL_MODULE_RENDERERS &&
      global.DGL_MODULE_RENDERERS[moduleId]
    ) {
      global.DGL_MODULE_RENDERERS[moduleId](mount, true);
    }

    setTimeout(markLive, 20);
  }

 function markLive() {
  if (!live) return;

  let changed = false;

  document.querySelectorAll(".sample-flag").forEach((element) => {
    if (element.dataset.dglLive === "true") return;

    element.dataset.dglLive = "true";
    element.innerHTML =
      '<i data-lucide="database" style="width:11px;height:11px"></i> Datos en vivo';
    element.style.color = "#9fe870";
    element.style.borderColor = "rgba(119,184,42,.45)";
    changed = true;
  });

  if (changed && global.lucide) {
    global.lucide.createIcons();
  }
}
  if (!live) return;

  let changed = false;

  document.querySelectorAll(".sample-flag").forEach((element) => {
    if (element.dataset.dglLive === "true") return;

    element.dataset.dglLive = "true";
    element.innerHTML =
      '<i data-lucide="database" style="width:11px;height:11px"></i> Datos en vivo';
    element.style.color = "#9fe870";
    element.style.borderColor = "rgba(119,184,42,.45)";
    changed = true;
  });

  if (changed && global.lucide) {
    global.lucide.createIcons();
  }
}
  if (!live) return;

  let changed = false;

  document.querySelectorAll(".sample-flag").forEach((element) => {
    if (element.dataset.dglLive === "true") return;

    element.dataset.dglLive = "true";
    element.innerHTML =
      '<i data-lucide="database" style="width:11px;height:11px"></i> Datos en vivo';
    element.style.color = "#9fe870";
    element.style.borderColor = "rgba(119,184,42,.45)";
    changed = true;
  });

  if (changed && global.lucide) {
    global.lucide.createIcons();
  }
}
  
    if (!live) return;

    document.querySelectorAll(".sample-flag").forEach((element) => {
      element.innerHTML =
        '<i data-lucide="database" style="width:11px;height:11px"></i> Datos en vivo';
      element.style.color = "#9fe870";
      element.style.borderColor = "rgba(119,184,42,.45)";
    });

    if (global.lucide) global.lucide.createIcons();
  }

  function updateAnalytics(dashboard) {
    if (!D() || !D().analytics || !dashboard) return;

    Object.assign(D().analytics, {
      activeCampaigns: Number(dashboard.activeCampaigns || 0),
      emailsSent: Number(dashboard.sentEmails || 0),
      revenueInfluenced: Number(dashboard.attributedRevenue || 0),
      accountsReactivated: D().customers.filter((customer) =>
        String(customer.status).toLowerCase().includes("reactiv")
      ).length,
      quotesRecovered: D().quotedNotBooked.filter((quote) =>
        ["Recovered", "Won", "Booked"].includes(quote.status)
      ).length,
      accountsRetained: D().retentionCampaigns.filter((record) =>
        ["Retained", "Completed"].includes(record.status)
      ).length
    });
  }

  async function syncAll(promptForKey) {
    if (!key()) {
      if (!promptForKey || !(await ensureKey())) return false;
    }

    setStatus("sync", "Cargando datos principales…");

    try {
      // Bootstrap is the only blocking request. Supplementary modules load
      // afterward and never keep the platform stuck in "Sincronizando".
  const campaigns = await jsonp(
  "list",
  { module: "campaigns" },
  true
);

const bootstrap = {
  campaigns: Array.isArray(campaigns) ? campaigns : [],
  customers: [],
  quotes: [],
  sequences: [],
  playbooks: [],
  assets: [],
  approvals: [],
  tasks: [],
  dashboard: {}
};


      replaceArray("campaigns", (bootstrap.campaigns || []).map(mapCampaign));
      replaceArray(
        "customers",
        (bootstrap.customers || []).map((customer) =>
          Object.assign({}, customer, { servicesUsed: parseList(customer.servicesUsed) })
        )
      );
      replaceArray(
        "quotedNotBooked",
        (bootstrap.quotes || []).map((quote) =>
          Object.assign({}, quote, {
            recoveryProbability: quote.recoveryProbability || "Media"
          })
        )
      );
      replaceArray("emailSequences", mapSequenceRows(bootstrap.sequences || []));
      replaceArray(
        "playbooks",
        (bootstrap.playbooks || []).map((playbook) =>
          Object.assign({}, playbook, {
            action: playbook.actionType || "",
            trigger: playbook.triggerValue || playbook.triggerType || ""
          })
        )
      );
      replaceArray(
        "assets",
        (bootstrap.assets || []).map((asset) =>
          Object.assign({}, asset, {
            updatedDate: String(asset.updatedAt || "").slice(0, 10)
          })
        )
      );
      replaceArray(
        "governance",
        (bootstrap.approvals || []).map((approval) => ({
          id: approval.id,
          campaign: approval.campaign,
          status: approval.status,
          checklist: {
            branding: String(approval.branding) !== "false",
            legal: String(approval.legal) !== "false",
            qa: String(approval.qa) !== "false"
          },
          owner: approval.requester || approval.approver,
          publishDate: approval.publishDate,
          channel: approval.channel
        }))
      );

      const pendingTasks = (bootstrap.tasks || []).filter(
        (task) => task.status === "Pending"
      );

      replaceArray(
        "mondayActionPlan",
        pendingTasks.slice(0, 12).map((task) => ({
          priority: task.priority || "Media",
          action: task.title,
          owner: task.owner,
          module: task.sourceType || "Campaign Tasks"
        }))
      );

      updateAnalytics(bootstrap.dashboard);

      D().meta.liveSync = true;
      D().meta.lastSync = new Date().toISOString();
      live = true;

      setStatus("online", "Apps Script conectado");
      rerender();

      // Load non-critical modules in the background.
      Promise.allSettled([
        jsonp("list", { module: "abm" }, true),
        jsonp("list", { module: "retention" }, true),
        jsonp("list", { module: "growth" }, true),
        jsonp("list", { module: "seoGeo" }, true)
      ]).then((results) => {
        const [abmResult, retentionResult, growthResult, seoResult] = results;

        if (abmResult.status === "fulfilled") {
          replaceArray(
            "abmAccounts",
            (abmResult.value || []).map((account) =>
              Object.assign({}, account, {
                currentServices: parseList(account.currentServices),
                suggestedServices: parseList(account.suggestedServices),
                activeCampaign: account.activeCampaignId || "Sin campaña"
              })
            )
          );
        }

        if (retentionResult.status === "fulfilled") {
          replaceArray("retentionCampaigns", retentionResult.value || []);
        }

        if (growthResult.status === "fulfilled") {
          replaceArray(
            "growthOpportunities",
            (growthResult.value || []).map((opportunity) =>
              Object.assign({}, opportunity, {
                currentServices: parseList(opportunity.currentServices)
              })
            )
          );
        }

        if (
          seoResult.status === "fulfilled" &&
          D().seoGeo &&
          (seoResult.value || []).length
        ) {
          D().seoGeo.strategicKeywords = seoResult.value.map((record) => ({
            keyword: record.keyword || record.topic,
            volume: Number(record.metricValue || 0),
            visibility: Number(record.metricValue || 0),
            trend: "flat"
          }));
        }

        rerender();
      });

      return true;
    } catch (error) {
      if (/Unauthorized/i.test(error.message)) {
        sessionStorage.removeItem(KEY_NAME);
      }

      setStatus("error", "Error: " + error.message);
      toast(error.message, "error");
      console.error("DGL Apps Script sync failed:", error);
      return false;
    }
  }

  function ruleForType(type) {
    if (type === "Recuperación de Cotizaciones" || type === "Post-Cotización") {
      return "quoted-not-booked";
    }
    if (type === "Reactivación" || type === "Recuperación de Cuentas") {
      return "reactivation-60";
    }
    if (type === "Retención") return "retention-risk";
    if (type === "Cross Selling" || type === "Upselling") {
      return "mono-service-growth";
    }
    return "";
  }

  async function upsert(module, record) {
    return jsonp("upsert", Object.assign({ module }, record), true);
  }

  async function list(module, filters) {
    return jsonp("list", { module, filters: filters || {} }, true);
  }

  async function get(module, id) {
    return jsonp("get", { module, id }, true);
  }

  async function refreshCampaignsFromAPI() {
    if (!key()) return false;

    const rows = await list("campaigns");
    replaceArray("campaigns", rows.map(mapCampaign));

    D().meta.liveSync = true;
    live = true;
    markLive();
    return true;
  }

  async function createCampaign(payload) {
    if (!(await ensureKey())) {
      return { ok: false, error: "Conexión cancelada" };
    }

    const saved = await upsert(
      "campaigns",
      Object.assign(
        {
          status: "Draft",
          objective:
            payload.objective ||
            payload.type + " para " + (payload.segment || "cartera objetivo"),
          approver: "Dirección Comercial",
          startDate: today(),
          endDate: plusDays(30),
          nextAction: "Generar audiencia y solicitar aprobación",
          priority: "Alta",
          automationRule: ruleForType(payload.type),
          sent: 0,
          replies: 0,
          quotes: 0,
          loads: 0,
          revenue: 0
        },
        payload
      )
    );

    return { ok: true, campaign: mapCampaign(saved) };
  }

  async function updateCampaign(id, fields) {
    if (!(await ensureKey())) {
      return { ok: false, error: "Conexión cancelada" };
    }

    const saved = await upsert("campaigns", Object.assign({ id }, fields));
    return { ok: true, campaign: mapCampaign(saved) };
  }

  async function generateAudience(id) {
    if (!(await ensureKey())) {
      return { ok: false, error: "Conexión cancelada" };
    }

    let campaign = await get("campaigns", id);
    const before = await list("campaignTasks", { campaignId: id });

    if (!campaign.automationRule) {
      campaign = await upsert("campaigns", {
        id,
        automationRule: ruleForType(campaign.type)
      });
    }

    await jsonp("runAutomation", {}, true);

    const after = await list("campaignTasks", { campaignId: id });

    await upsert("campaigns", {
      id,
      audienceCount: after.length,
      taskCount: after.length
    });

    return {
      ok: true,
      audienceAdded: Math.max(0, after.length - before.length),
      audienceTotal: after.length
    };
  }

  async function sendCampaignEmails(id) {
    if (!(await ensureKey())) {
      return { ok: false, error: "Conexión cancelada" };
    }

    const queued = await jsonp("enqueueCampaign", { campaignId: id }, true);
    const processed = await jsonp("processEmailQueue", {}, true);
    const campaign = await get("campaigns", id);

    const total =
      Number(campaign.sent || 0) +
      Number(processed.drafted || 0) +
      Number(processed.sent || 0);

    await upsert("campaigns", { id, sent: total });

    return {
      ok: true,
      draftsCreated: Number(processed.drafted || 0),
      emailsSentTotal: total,
      queued: queued.queued || 0
    };
  }

  async function logResponse(id) {
    if (!(await ensureKey())) {
      return { ok: false, error: "Conexión cancelada" };
    }

    const campaign = await get("campaigns", id);
    const replies = Number(campaign.replies || 0) + 1;

    await upsert("campaigns", { id, replies });

    return {
      ok: true,
      responsesLogged: replies
    };
  }

  function injectStatus() {
    const style = document.createElement("style");
    style.textContent =
      ".dgl-gas-status{position:fixed;right:18px;bottom:18px;z-index:9998;" +
      "border:1px solid rgba(255,255,255,.14);background:#0d1122;color:#cbd5e1;" +
      "border-radius:12px;padding:10px 13px;font:600 11px Inter,sans-serif;" +
      "box-shadow:0 12px 35px rgba(0,0,0,.35);cursor:pointer}" +
      ".dgl-gas-status.online{color:#9fe870;border-color:rgba(119,184,42,.45)}" +
      ".dgl-gas-status.error{color:#ff9c9c;border-color:rgba(239,68,68,.45)}";

    document.head.appendChild(style);

    const button = document.createElement("button");
    button.id = "dglGasStatus";
    button.className = "dgl-gas-status";
    button.textContent = "Conectar Apps Script";
    button.addEventListener("click", () => syncAll(true));

    document.body.appendChild(button);
  }

  function setStatus(className, text) {
    const element = document.getElementById("dglGasStatus");
    if (!element) return;

    element.className = "dgl-gas-status " + className;
    element.textContent = text;
  }

  async function saveGenericForm() {
    if (!(await ensureKey())) return;

    const title =
      (document.getElementById("dgl-modal-title") || {}).textContent || "";
    const values = Array.from(
      document.querySelectorAll("#dgl-modal-body input")
    ).map((input) => input.value.trim());

    if (title.includes("Secuencia")) {
      await upsert("emailSequences", {
        id: uid("SEQ"),
        name: values[0],
        trigger: values[1],
        segment: values[2],
        status: "Draft",
        campaignType: values[2],
        step: 1,
        delayHours: 0,
        subject: "Definir asunto",
        textBody: "Definir contenido",
        htmlBody: "<p>Definir contenido</p>",
        owner: "Marketing"
      });
    } else if (title.includes("Playbook")) {
      await upsert("playbooks", {
        id: uid("PLY"),
        name: values[0],
        triggerType: values[1],
        triggerValue: values[1],
        segment: values[2],
        actionType: values[3],
        channel: values[4],
        owner: "Marketing",
        executionFrequency: "Daily",
        status: "Draft"
      });
    } else if (title.includes("Asset")) {
      await upsert("assets", {
        id: uid("AST"),
        title: values[0],
        type: values[1],
        service: values[2],
        segment: values[3],
        status: "Draft",
        owner: "Marketing"
      });
    } else if (title.includes("Cuenta ABM")) {
      await upsert("abm", {
        id: uid("ABM"),
        name: values[0],
        profile: values[1],
        currentServices: JSON.stringify(parseList(values[2])),
        suggestedServices: JSON.stringify(parseList(values[3])),
        commercialStatus: "New",
        owner: "Marketing",
        score: 50
      });
    }

    closeModal();
    toast("Registro guardado en Google Sheets.");
    await syncAll(false);
  }

  document.addEventListener(
    "click",
    function (event) {
      const button = event.target.closest("[data-action]");
      if (!button) return;

      const action = button.dataset.action;
      const managedActions = [
        "submit-generic",
        "mark-recovery-sent",
        "enroll-sequence",
        "activate-growth",
        "schedule-qbr",
        "copy-asset",
        "export-report"
      ];

      if (!managedActions.includes(action)) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      (async () => {
        try {
          if (action === "submit-generic") {
            await saveGenericForm();
            return;
          }

          if (!(await ensureKey())) return;

          const id = button.dataset.id;

          if (action === "mark-recovery-sent") {
            await upsert("quotes", {
              id,
              status: "Follow-up Sent",
              nextAction: "Esperar respuesta y revisar en 48 horas"
            });

            closeModal();
            toast("Seguimiento registrado en QUOTES.");
          } else if (
            action === "enroll-sequence" ||
            action === "activate-growth"
          ) {
            await jsonp("runAutomation", {}, true);
            closeModal();
            toast("Automatización ejecutada y tareas generadas.");
          } else if (action === "schedule-qbr") {
            const account =
              D().abmAccounts.find((record) => record.id === id) || {};

            await upsert("campaignTasks", {
              id: uid("TSK"),
              title: "QBR · " + (account.name || id),
              owner: account.owner || "Account Management",
              dueDate: plusDays(7),
              priority: "Alta",
              status: "Pending",
              sourceType: "ABM",
              sourceId: id,
              notes: account.nextAction || ""
            });

            closeModal();
            toast("QBR registrado como tarea.");
          } else if (action === "copy-asset") {
            const asset =
              D().assets.find((record) => record.id === id) || {};

            if (asset.driveUrl) {
              window.open(asset.driveUrl, "_blank");
            } else {
              await navigator.clipboard.writeText(asset.title || id);
            }

            toast(asset.driveUrl ? "Asset abierto en Drive." : "Referencia copiada.");
          } else if (action === "export-report") {
            const report = await jsonp("dashboard", {}, true);
            const blob = new Blob([JSON.stringify(report, null, 2)], {
              type: "application/json"
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "dgl-marketing-report-" + today() + ".json";
            link.click();
            URL.revokeObjectURL(url);

            toast("Reporte exportado.");
          }

          await syncAll(false);
        } catch (error) {
          toast(error.message, "error");
        }
      })();
    },
    true
  );

  global.DGL_API = {
    API_BASE: ENDPOINT,
    connect: () => syncAll(true),
    syncAll,
    refreshCampaignsFromAPI,
    createCampaign,
    updateCampaign,
    generateAudience,
    sendCampaignEmails,
    logResponse,
    list,
    get,
    upsert,
    runAutomation: () => jsonp("runAutomation", {}, true),
    processEmailQueue: () => jsonp("processEmailQueue", {}, true),
    disconnect: () => {
      sessionStorage.removeItem(KEY_NAME);
      live = false;
      setStatus("", "Conectar Apps Script");
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    injectStatus();

    jsonp("health", {}, false)
      .then(() => {
        setStatus(
          key() ? "sync" : "",
          key() ? "Sincronizando…" : "Backend online · conectar"
        );
        if (key()) syncAll(false);
      })
      .catch(() => setStatus("error", "Backend no disponible"));

    new MutationObserver(markLive).observe(document.body, {
      childList: true,
      subtree: true
    });
  });
})(window);
