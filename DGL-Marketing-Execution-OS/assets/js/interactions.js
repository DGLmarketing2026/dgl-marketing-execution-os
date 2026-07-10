/**
 * DGL Marketing Execution OS — Interactions Layer
 * Sidebar collapse, mobile nav, global search, generic filter wiring,
 * toasts, and the detail modals triggered by data-action attributes.
 */
(function (global) {
  "use strict";

  const D = () => global.DGL_DATA;
  const UI = () => global.DGL_UI;
  const H = () => global.DGL_MODULE_HELPERS;

  /* ---------------------------------------------------------------
   * GENERIC FILTER WIRING (used by module renderers)
   * --------------------------------------------------------------- */
  function wireFilters(scopeEl, dataset, fieldMap, renderResultsFn) {
    function getState() {
      const state = {};
      scopeEl.querySelectorAll("[data-filter-key]").forEach((el) => {
        if (el.value) state[el.dataset.filterKey] = el.value;
      });
      return state;
    }
    function update() {
      const state = getState();
      const filtered = UI().applyFilters(dataset, state, fieldMap);
      renderResultsFn(filtered);
      const countEl = scopeEl.querySelector("[data-filter-count]");
      if (countEl) countEl.textContent = filtered.length + " resultados";
    }
    scopeEl.addEventListener("input", (e) => { if (e.target.matches("[data-filter-key]")) update(); });
    scopeEl.addEventListener("change", (e) => { if (e.target.matches("[data-filter-key]")) update(); });
  }
  global.DGL_INTERACTIONS = { wireFilters };

  /* ---------------------------------------------------------------
   * TOASTS
   * --------------------------------------------------------------- */
  function toast(message, type) {
    let container = document.getElementById("toastContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
      container.className = "toast-container";
      document.body.appendChild(container);
    }
    const el = document.createElement("div");
    el.className = "toast " + (type || "success");
    el.innerHTML = `<i data-lucide="${type === "error" ? "alert-circle" : "check-circle-2"}" style="width:16px;height:16px"></i><span>${message}</span>`;
    container.appendChild(el);
    if (global.lucide) global.lucide.createIcons();
    setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity 300ms"; setTimeout(() => el.remove(), 300); }, 3200);
  }
  global.DGL_INTERACTIONS.toast = toast;

  /* ---------------------------------------------------------------
   * DETAIL MODAL BUILDERS
   * --------------------------------------------------------------- */
  function detailRow(label, value) {
    return `<div class="flex justify-between" style="padding:9px 0;border-bottom:1px dashed var(--border);font-size:12.5px">
      <span class="text-muted">${label}</span><span style="font-weight:600;text-align:right;max-width:60%">${value}</span>
    </div>`;
  }

  function openRecoveryDetail(id) {
    const r = D().quotedNotBooked.find((x) => x.id === id);
    if (!r) return;
    UI().openModal({
      title: "Plan de Recuperación — " + r.customer,
      bodyHtml: `
        ${detailRow("Servicio cotizado", r.service)}
        ${detailRow("Valor cotizado", H().money(r.quotedValue))}
        ${detailRow("Fecha de cotización", r.quoteDate)}
        ${detailRow("Días sin respuesta", r.daysNoResponse + " días")}
        ${detailRow("Motivo probable", r.lossReason)}
        ${detailRow("Probabilidad de recuperación", r.recoveryProbability)}
        <div class="divider"></div>
        <div style="font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Email Recomendado</div>
        <p style="font-size:13px;margin-bottom:14px">${r.recommendedEmail}</p>
        <div style="font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Script Recomendado</div>
        <p style="font-size:13px;margin-bottom:14px">${r.recommendedScript}</p>
        <div style="font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Próxima Acción</div>
        <p style="font-size:13px;font-weight:600;color:var(--secondary)">${r.nextAction}</p>
      `,
      footHtml: `<button class="btn btn-ghost" data-action="close-modal">Cerrar</button>
        <button class="btn btn-primary" data-action="mark-recovery-sent" data-id="${r.id}"><i data-lucide="send"></i>Ejecutar Acción</button>`
    });
  }

  function openReactivationDetail(id) {
    const c = D().customers.find((x) => x.id === id);
    if (!c) return;
    UI().openModal({
      title: c.name,
      bodyHtml: `
        <div class="flex gap-8" style="margin-bottom:14px">${H().tierBadge(c.tier)}${H().statusBadge(c.status)}</div>
        ${detailRow("Industria", c.industry)}
        ${detailRow("Región", c.region)}
        ${detailRow("Account Manager", c.accountManager)}
        ${detailRow("Última carga", c.lastLoadDate)}
        ${detailRow("Última cotización", c.lastQuoteDate)}
        ${detailRow("Revenue YTD", H().money(c.revenueYTD))}
        ${detailRow("Revenue histórico", H().money(c.revenueHistoric))}
        ${detailRow("Servicios usados", c.servicesUsed.join(", "))}
        ${detailRow("Servicio recomendado", c.recommendedService)}
        ${c.coolingReason ? detailRow("Motivo de enfriamiento", c.coolingReason) : ""}
        <div class="divider"></div>
        <div style="font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Próxima Acción</div>
        <p style="font-size:13px;font-weight:600;color:var(--secondary)">${c.nextAction}</p>
      `,
      footHtml: `<button class="btn btn-ghost" data-action="close-modal">Cerrar</button>
        <button class="btn btn-primary" data-action="enroll-sequence" data-id="${c.id}"><i data-lucide="zap"></i>Inscribir en Secuencia</button>`
    });
  }

  function openGrowthDetail(id) {
    const g = D().growthOpportunities.find((x) => x.customerId === id);
    if (!g) return;
    UI().openModal({
      title: "Oportunidad de Crecimiento — " + g.customer,
      bodyHtml: `
        ${detailRow("Servicios actuales", g.currentServices.join(", "))}
        ${detailRow("Servicio sugerido", g.suggestedService)}
        ${detailRow("Racional comercial", g.rationale)}
        ${detailRow("Uplift estimado", H().money(g.estimatedUplift))}
        ${detailRow("Score de oportunidad", g.opportunityScore + " / 100")}
      `,
      footHtml: `<button class="btn btn-ghost" data-action="close-modal">Cerrar</button>
        <button class="btn btn-primary" data-action="activate-growth" data-id="${g.customerId}"><i data-lucide="trending-up"></i>Activar Campaña de Crecimiento</button>`
    });
  }

  function openAbmDetail(id) {
    const a = D().abmAccounts.find((x) => x.id === id);
    if (!a) return;
    UI().openModal({
      title: a.name,
      bodyHtml: `
        ${detailRow("Perfil", a.profile)}
        ${detailRow("Estado comercial", a.commercialStatus)}
        ${detailRow("Servicios actuales", a.currentServices.join(", "))}
        ${detailRow("Servicios sugeridos", a.suggestedServices.join(", "))}
        ${detailRow("Campaña activa", a.activeCampaign)}
        ${detailRow("Último contacto", a.lastContact)}
        <div class="divider"></div>
        <div style="font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Mensaje Recomendado</div>
        <p style="font-size:13px;margin-bottom:14px">${a.recommendedMessage}</p>
        <div style="font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Próxima Acción</div>
        <p style="font-size:13px;font-weight:600;color:var(--secondary)">${a.nextAction}</p>
      `,
      footHtml: `<button class="btn btn-ghost" data-action="close-modal">Cerrar</button>
        <button class="btn btn-primary" data-action="schedule-qbr" data-id="${a.id}"><i data-lucide="calendar-check"></i>Agendar Acción</button>`
    });
  }

  function openAssetDetail(id) {
    const a = D().assets.find((x) => x.id === id);
    if (!a) return;
    UI().openModal({
      title: a.title,
      bodyHtml: `
        ${detailRow("Tipo", a.type)}
        ${detailRow("Servicio", a.service)}
        ${detailRow("Segmento", a.segment)}
        ${detailRow("Estado", a.status)}
        ${detailRow("Actualizado", a.updatedDate)}
        <div class="divider"></div>
        <div style="font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Uso Recomendado</div>
        <p style="font-size:13px">${a.recommendedUse}</p>
      `,
      footHtml: `<button class="btn btn-ghost" data-action="close-modal">Cerrar</button>
        <button class="btn btn-primary" data-action="copy-asset" data-id="${a.id}"><i data-lucide="copy"></i>Copiar / Descargar</button>`
    });
  }

  function openCreateCampaign(preset) {
    const types = ["Reactivación", "Post-Cotización", "Recuperación de Cotizaciones", "Retención", "Cross Selling", "Upselling", "Recuperación de Cuentas", "Temporada Logística", "Por Tipo de Servicio"];
    UI().openModal({
      title: "Crear Nueva Campaña",
      bodyHtml: `
        <div class="form-field"><label>Nombre de campaña</label><input type="text" placeholder="Ej. Reactivación 60 días — Automotriz" /></div>
        <div class="form-grid-2">
          <div class="form-field"><label>Tipo de campaña</label>
            <select>${types.map((t) => `<option ${t === preset ? "selected" : ""}>${t}</option>`).join("")}</select>
          </div>
          <div class="form-field"><label>Canal</label><select><option>Email</option><option>Email + Llamada</option><option>Email + LinkedIn</option><option>Email masivo segmentado</option></select></div>
        </div>
        <div class="form-field"><label>Segmento objetivo</label><input type="text" placeholder="Ej. Inactive-60 · Industrial" /></div>
        <div class="form-grid-2">
          <div class="form-field"><label>KPI principal</label><input type="text" placeholder="Ej. Cuentas reactivadas" /></div>
          <div class="form-field"><label>Responsable</label><input type="text" placeholder="Ej. C. Serna" /></div>
        </div>
        <div class="form-field"><label>Resultado esperado</label><input type="text" placeholder="Ej. 4 cuentas reactivadas en 30 días" /></div>
      `,
      footHtml: `<button class="btn btn-ghost" data-action="close-modal">Cancelar</button>
        <button class="btn btn-primary" data-action="submit-create-campaign"><i data-lucide="check"></i>Crear Campaña</button>`
    });
  }

  function openSimpleForm(title, fields, submitAction, submitLabel) {
    UI().openModal({
      title,
      bodyHtml: fields.map((f) => `<div class="form-field"><label>${f}</label><input type="text" placeholder="${f}" /></div>`).join(""),
      footHtml: `<button class="btn btn-ghost" data-action="close-modal">Cancelar</button>
        <button class="btn btn-primary" data-action="${submitAction}"><i data-lucide="check"></i>${submitLabel}</button>`
    });
  }

  /* ---------------------------------------------------------------
   * GLOBAL EVENT DELEGATION
   * --------------------------------------------------------------- */
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    switch (action) {
      case "open-recovery-detail": openRecoveryDetail(id); break;
      case "open-reactivation-detail": openReactivationDetail(id); break;
      case "open-growth-detail": openGrowthDetail(id); break;
      case "open-abm-detail": openAbmDetail(id); break;
      case "open-asset-detail": openAssetDetail(id); break;
      case "open-create-campaign": openCreateCampaign(btn.dataset.preset); break;
      case "open-sequence-builder": openSimpleForm("Nueva Secuencia de Email", ["Nombre de la secuencia", "Trigger de activación", "Segmento", "Número de emails"], "submit-generic", "Crear Secuencia"); break;
      case "open-create-playbook": openSimpleForm("Nuevo Playbook de Automatización", ["Nombre del playbook", "Trigger", "Segmento", "Acción a ejecutar", "Canal"], "submit-generic", "Crear Playbook"); break;
      case "open-upload-asset": openSimpleForm("Agregar Asset a la Biblioteca", ["Título del asset", "Tipo", "Servicio relacionado", "Segmento objetivo"], "submit-generic", "Guardar Asset"); break;
      case "open-add-abm": openSimpleForm("Agregar Cuenta ABM", ["Nombre de la cuenta", "Perfil comercial", "Servicios actuales", "Servicio sugerido"], "submit-generic", "Agregar Cuenta"); break;

      case "submit-create-campaign": UI().closeModal(); toast("Campaña creada en modo demo. Se sincronizará al conectar CRM."); break;
      case "submit-generic": UI().closeModal(); toast("Guardado en modo demo."); break;
      case "mark-recovery-sent": UI().closeModal(); toast("Acción de recuperación registrada."); break;
      case "enroll-sequence": UI().closeModal(); toast("Cuenta inscrita en secuencia de reactivación."); break;
      case "activate-growth": UI().closeModal(); toast("Campaña de crecimiento activada para la cuenta."); break;
      case "schedule-qbr": UI().closeModal(); toast("Acción agendada con el Account Manager."); break;
      case "copy-asset": toast("Asset copiado al portapapeles (modo demo)."); break;
      case "export-report": toast("Reporte ejecutivo exportado (modo demo)."); break;

      case "toggle-action":
        btn.classList.toggle("done");
        break;
      default: break;
    }
  });

  /* ---------------------------------------------------------------
   * SIDEBAR COLLAPSE / MOBILE NAV
   * --------------------------------------------------------------- */
  function initShellInteractions() {
    const shell = document.getElementById("appShell");
    document.addEventListener("click", (e) => {
      if (e.target.closest("#sidebarToggle")) {
        shell.classList.toggle("sidebar-collapsed");
        const label = shell.classList.contains("sidebar-collapsed") ? "Expandir" : "Colapsar";
        const btnEl = document.getElementById("sidebarToggle");
        if (btnEl) {
          btnEl.querySelector("span").textContent = label;
          btnEl.querySelector("[data-lucide]").setAttribute("data-lucide", shell.classList.contains("sidebar-collapsed") ? "panel-left-open" : "panel-left-close");
          if (global.lucide) global.lucide.createIcons();
        }
      }
      if (e.target.closest("#mobileMenuBtn")) {
        document.getElementById("sidebar").classList.toggle("mobile-open");
      }
      if (e.target.closest(".nav-item")) {
        document.getElementById("sidebar").classList.remove("mobile-open");
      }
    });
  }
  global.DGL_INTERACTIONS.initShellInteractions = initShellInteractions;

  /* ---------------------------------------------------------------
   * GLOBAL SEARCH (lightweight, client-side across key entities)
   * --------------------------------------------------------------- */
  function initGlobalSearch() {
    document.addEventListener("input", (e) => {
      if (e.target.id !== "globalSearchInput") return;
      const q = e.target.value.trim().toLowerCase();
      let dropdown = document.getElementById("globalSearchDropdown");
      if (!dropdown) {
        dropdown = document.createElement("div");
        dropdown.id = "globalSearchDropdown";
        dropdown.className = "card";
        dropdown.style.cssText = "position:absolute;top:56px;left:0;right:0;max-width:420px;margin:0 auto;z-index:250;max-height:320px;overflow-y:auto;padding:8px;display:none";
        e.target.closest(".global-search").style.position = "relative";
        e.target.closest(".global-search").appendChild(dropdown);
      }
      if (!q) { dropdown.style.display = "none"; return; }

      const results = [];
      D().customers.forEach((c) => { if (c.name.toLowerCase().includes(q)) results.push({ label: c.name, sub: "Cuenta · " + c.status, mod: "reactivation" }); });
      D().campaigns.forEach((c) => { if (c.name.toLowerCase().includes(q)) results.push({ label: c.name, sub: "Campaña · " + c.status, mod: "campaign-execution" }); });
      D().assets.forEach((a) => { if (a.title.toLowerCase().includes(q)) results.push({ label: a.title, sub: "Asset · " + a.type, mod: "sales-enablement" }); });

      const top = results.slice(0, 6);
      dropdown.innerHTML = top.length
        ? top.map((r) => `<div class="nav-item" style="margin:2px;cursor:pointer;white-space:normal;height:auto;align-items:flex-start" data-goto="${r.mod}"><i data-lucide="corner-down-right" style="margin-top:2px"></i><span style="overflow:hidden;text-overflow:ellipsis">${r.label}<br/><span style="font-size:10.5px;color:var(--muted)">${r.sub}</span></span></div>`).join("")
        : `<div style="padding:14px;text-align:center;color:var(--muted);font-size:12px">Sin resultados para "${q}"</div>`;
      dropdown.style.display = "block";
      if (global.lucide) global.lucide.createIcons();
    });

    document.addEventListener("click", (e) => {
      const goto = e.target.closest("[data-goto]");
      if (goto) {
        window.location.hash = "#/" + goto.dataset.goto;
        const dd = document.getElementById("globalSearchDropdown");
        if (dd) dd.style.display = "none";
        document.getElementById("globalSearchInput").value = "";
      } else if (!e.target.closest(".global-search")) {
        const dd = document.getElementById("globalSearchDropdown");
        if (dd) dd.style.display = "none";
      }
    });
  }
  global.DGL_INTERACTIONS.initGlobalSearch = initGlobalSearch;

  /* ---------------------------------------------------------------
   * HEADER QUICK CREATE
   * --------------------------------------------------------------- */
  document.addEventListener("click", (e) => {
    if (e.target.closest("#btnCreateCampaign")) openCreateCampaign();
  });

})(window);
