/**
 * DGL Marketing Campaign Studio V3
 * Campaign composition, design preview, template library and Gmail draft orchestration.
 * No customer PII is stored in this file.
 */
(function (global) {
  "use strict";

  const VERSION = "3.0";
  const D = () => global.DGL_DATA || {};
  const UI = () => global.DGL_UI || {};
  const API = () => global.DGL_API || {};
  const esc = (v) => String(v == null ? "" : v)
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");

  const TEMPLATES = [
    {
      id: "executive-dark",
      name: "Executive Dark",
      use: "Reactivation / Service Campaign",
      description: "Diseño premium oscuro con headline fuerte, CTA único y bloque de valor."
    },
    {
      id: "clean-white",
      name: "Clean White",
      use: "Strategic / Account Nurture",
      description: "Diseño ejecutivo claro, más personal y menos promocional."
    },
    {
      id: "service-hero",
      name: "Service Hero",
      use: "FTL / LTL / Drayage",
      description: "Hero visual opcional + mensaje corto orientado a un servicio."
    },
    {
      id: "qnb-minimal",
      name: "QNB Minimal",
      use: "Quoted Not Booked",
      description: "Muy directo. Menos diseño, más conversación y recuperación."
    }
  ];

  const COPY_PRESETS = {
    "Reactivation": {
      subject: "{{firstName}}, ¿tienen movimientos pendientes esta semana?",
      preheader: "DGL está disponible para apoyar sus próximos movimientos.",
      headline: "READY FOR YOUR NEXT MOVE.",
      body: "Hace un tiempo tuvimos la oportunidad de apoyar a {{company}}. Quería volver a poner a DGL a su disposición para sus próximos movimientos {{service}}.",
      body2: "Si tienen algo por cotizar o programar, envíemelo y revisamos capacidad y tarifa.",
      cta: "ENVIAR MOVIMIENTO"
    },
    "Quoted Not Booked": {
      subject: "{{firstName}}, ¿sigue activo este movimiento?",
      preheader: "Podemos revisar nuevamente capacidad y tarifa.",
      headline: "¿SIGUE ACTIVO ESTE MOVIMIENTO?",
      body: "Vimos que recientemente cotizamos un movimiento {{service}} para {{company}} y quería confirmar si todavía sigue en proceso.",
      body2: "Si cambió alguna condición, origen, destino o fecha, envíemela y lo revisamos nuevamente.",
      cta: "ACTUALIZAR COTIZACIÓN"
    },
    "Cross-Sell": {
      subject: "{{firstName}}, una opción adicional para {{company}}",
      preheader: "Una capacidad complementaria a los servicios que ya trabajan con DGL.",
      headline: "ONE PARTNER. MORE OPTIONS.",
      body: "Además de los servicios que ya han trabajado con DGL, queremos poner a su disposición nuestra capacidad en {{service}}.",
      body2: "Si tienen un movimiento donde podamos evaluar esta alternativa, compártanos los detalles y lo revisamos.",
      cta: "SOLICITAR COTIZACIÓN"
    },
    "Retention": {
      subject: "{{firstName}}, seguimos disponibles para apoyar a {{company}}",
      preheader: "Capacidad y soporte para sus próximos movimientos.",
      headline: "KEEPING YOUR FREIGHT MOVING.",
      body: "Queremos mantenernos cerca de las necesidades de {{company}} y disponibles para apoyar sus próximos movimientos {{service}}.",
      body2: "Si tienen nuevas rutas, cambios de volumen o próximos requerimientos, podemos revisarlos con ustedes.",
      cta: "HABLAR CON DGL"
    },
    "Nurture": {
      subject: "DGL | Capacidad disponible para sus próximos movimientos",
      preheader: "FTL, LTL, Drayage y soluciones inland cuando las necesite.",
      headline: "CAPACITY WHEN YOU NEED IT.",
      body: "DGL continúa apoyando movimientos terrestres en USA, México y Canadá con soluciones adaptadas a cada necesidad.",
      body2: "Cuando tengan un nuevo requerimiento, estaremos listos para revisarlo.",
      cta: "CONTACTAR A DGL"
    }
  };

  function pageHead(title, lede) {
    return `
      <div class="page-head">
        <div>
          <div class="eyebrow">Campaign Studio</div>
          <h2>${esc(title)}</h2>
          <p class="lede">${esc(lede)}</p>
        </div>
        <div class="page-head-actions">
          <span class="badge badge-success">CREATIVE ENGINE · V${VERSION}</span>
        </div>
      </div>`;
  }

  function audienceOptions() {
    if (global.DGL_MARKETING_CAMPAIGN_OS && global.DGL_MARKETING_CAMPAIGN_OS.buildAudiences) {
      return global.DGL_MARKETING_CAMPAIGN_OS.buildAudiences();
    }
    return [];
  }

  function templateOptions() {
    return TEMPLATES.map(t => `<option value="${t.id}">${esc(t.name)} · ${esc(t.use)}</option>`).join("");
  }

  function presetOptions() {
    return Object.keys(COPY_PRESETS).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");
  }

  function serviceOptions() {
    return ["FTL","LTL","Drayage","Cross Border","Reefer","Intermodal","Multiservicio"]
      .map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");
  }

  function applyPreset(name) {
    const p = COPY_PRESETS[name] || COPY_PRESETS.Reactivation;
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };
    set("mcsSubject", p.subject);
    set("mcsPreheader", p.preheader);
    set("mcsHeadline", p.headline);
    set("mcsBody", p.body);
    set("mcsBody2", p.body2);
    set("mcsCta", p.cta);
    updatePreview();
  }

  function value(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

  function campaignPayload() {
    return {
      campaignName: value("mcsCampaignName"),
      campaignType: value("mcsCampaignType"),
      audienceId: value("mcsAudience"),
      service: value("mcsService"),
      language: value("mcsLanguage"),
      templateId: value("mcsTemplate"),
      subject: value("mcsSubject"),
      preheader: value("mcsPreheader"),
      headline: value("mcsHeadline"),
      body: value("mcsBody"),
      body2: value("mcsBody2"),
      cta: value("mcsCta"),
      ctaUrl: value("mcsCtaUrl"),
      heroUrl: value("mcsHeroUrl"),
      logoUrl: value("mcsLogoUrl"),
      senderName: value("mcsSenderName") || "DGL Freight Broker",
      replyTo: value("mcsReplyTo"),
      aiPersonalization: !!(document.getElementById("mcsAI") || {}).checked
    };
  }

  function sampleMerge(payload) {
    const sample = {
      firstName: "Laura",
      company: "ABC Logistics",
      service: payload.service || "FTL"
    };
    const merge = (txt) => String(txt || "")
      .replaceAll("{{firstName}}", sample.firstName)
      .replaceAll("{{company}}", sample.company)
      .replaceAll("{{service}}", sample.service);
    return Object.assign({}, payload, {
      subject: merge(payload.subject),
      preheader: merge(payload.preheader),
      headline: merge(payload.headline),
      body: merge(payload.body),
      body2: merge(payload.body2),
      cta: merge(payload.cta)
    });
  }

  function emailHtml(p) {
    const payload = sampleMerge(p);
    const isWhite = payload.templateId === "clean-white" || payload.templateId === "qnb-minimal";
    const bg = isWhite ? "#f5f7fa" : "#050711";
    const card = isWhite ? "#ffffff" : "#0b1020";
    const text = isWhite ? "#141827" : "#ffffff";
    const muted = isWhite ? "#5d6475" : "#b6becf";
    const border = isWhite ? "#e3e7ee" : "#222a40";
    const green = "#77B82A";
    const hero = payload.heroUrl && payload.templateId !== "qnb-minimal"
      ? `<img src="${esc(payload.heroUrl)}" alt="" width="100%" style="display:block;width:100%;max-height:310px;object-fit:cover;border:0;">`
      : "";
    const logo = payload.logoUrl
      ? `<img src="${esc(payload.logoUrl)}" alt="DGL Freight Broker" style="display:block;max-width:190px;max-height:72px;border:0;">`
      : `<div style="font-family:Arial,sans-serif;font-size:28px;font-weight:900;letter-spacing:1px;color:${text};">DGL <span style="font-size:11px;font-weight:700;letter-spacing:2px;color:${green};">FREIGHT BROKER</span></div>`;

    const qnbStyle = payload.templateId === "qnb-minimal";
    const headlineSize = qnbStyle ? "28px" : "34px";
    return `
    <!doctype html>
    <html>
    <body style="margin:0;padding:0;background:${bg};">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(payload.preheader)}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${bg};">
        <tr><td align="center" style="padding:26px 12px;">
          <table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;background:${card};border:1px solid ${border};border-radius:18px;overflow:hidden;">
            <tr><td style="padding:28px 34px;border-bottom:1px solid ${border};">${logo}</td></tr>
            ${hero ? `<tr><td>${hero}</td></tr>` : ""}
            <tr><td style="padding:${qnbStyle ? "38px 38px 30px" : "42px 38px"};font-family:Arial,sans-serif;color:${text};">
              <div style="height:4px;width:58px;background:${green};margin-bottom:22px;border-radius:8px;"></div>
              <div style="font-size:${headlineSize};line-height:1.08;font-weight:900;letter-spacing:-.4px;color:${text};">${esc(payload.headline)}</div>
              <p style="font-size:16px;line-height:1.65;color:${muted};margin:25px 0 0;">${esc(payload.body)}</p>
              <p style="font-size:16px;line-height:1.65;color:${muted};margin:12px 0 0;">${esc(payload.body2)}</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px;">
                <tr><td bgcolor="${green}" style="border-radius:9px;">
                  <a href="${esc(payload.ctaUrl || "#")}" style="display:inline-block;padding:15px 24px;font-family:Arial,sans-serif;font-size:14px;font-weight:800;text-decoration:none;color:#081005;">${esc(payload.cta)} &nbsp;→</a>
                </td></tr>
              </table>
            </td></tr>
            <tr><td style="padding:22px 34px;border-top:1px solid ${border};font-family:Arial,sans-serif;color:${muted};font-size:12px;line-height:1.55;">
              <strong style="color:${text};">DGL Freight Broker</strong><br>
              FTL · LTL · Drayage · Intermodal · Cross-Border<br>
              <span style="color:${green};">Your inland freight partner.</span>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>`;
  }

  function updatePreview() {
    const frame = document.getElementById("mcsPreview");
    if (!frame) return;
    frame.srcdoc = emailHtml(campaignPayload());
    const subject = document.getElementById("mcsPreviewSubject");
    if (subject) subject.textContent = sampleMerge(campaignPayload()).subject;
  }

  function render(container) {
    const audiences = audienceOptions();
    container.innerHTML = `
      ${pageHead("DGL Campaign Studio","Diseña, personaliza, previsualiza y ejecuta campañas HTML sobre audiencias provenientes de NOVA/Salesforce.")}
      <div class="grid-2" style="align-items:start">
        <div class="stack">
          <div class="card card-pad">
            <div class="section-heading" style="margin-top:0"><h3>1. Campaign Setup</h3><span class="hint">Audiencia + objetivo</span></div>
            <div class="form-grid">
              <label class="form-field"><span>Campaign Name</span><input id="mcsCampaignName" class="input" value="Reactivation FTL · 60 Days"></label>
              <label class="form-field"><span>Campaign Type</span><select id="mcsCampaignType" class="input">${presetOptions()}</select></label>
              <label class="form-field"><span>NOVA Audience</span><select id="mcsAudience" class="input">
                <option value="">Seleccionar audiencia</option>
                ${audiences.map(a=>`<option value="${esc(a.id)}">${esc(a.name)} · ${a.count} registros</option>`).join("")}
              </select></label>
              <label class="form-field"><span>Service</span><select id="mcsService" class="input">${serviceOptions()}</select></label>
              <label class="form-field"><span>Language</span><select id="mcsLanguage" class="input"><option>Spanish</option><option>English</option></select></label>
              <label class="form-field"><span>Creative Template</span><select id="mcsTemplate" class="input">${templateOptions()}</select></label>
            </div>
            <label style="display:flex;align-items:center;gap:8px;margin-top:12px"><input id="mcsAI" type="checkbox" checked> <span class="text-secondary">AI personalization when backend AI is enabled</span></label>
          </div>

          <div class="card card-pad">
            <div class="section-heading" style="margin-top:0"><h3>2. Message</h3><span class="hint">Variables permitidas: {{firstName}}, {{company}}, {{service}}</span></div>
            <div class="stack">
              <label class="form-field"><span>Subject</span><input id="mcsSubject" class="input"></label>
              <label class="form-field"><span>Preheader</span><input id="mcsPreheader" class="input"></label>
              <label class="form-field"><span>Headline</span><input id="mcsHeadline" class="input"></label>
              <label class="form-field"><span>Body</span><textarea id="mcsBody" class="input" rows="4"></textarea></label>
              <label class="form-field"><span>Body 2</span><textarea id="mcsBody2" class="input" rows="3"></textarea></label>
              <div class="grid-2">
                <label class="form-field"><span>CTA</span><input id="mcsCta" class="input"></label>
                <label class="form-field"><span>CTA URL</span><input id="mcsCtaUrl" class="input" placeholder="https://..."></label>
              </div>
            </div>
          </div>

          <div class="card card-pad">
            <div class="section-heading" style="margin-top:0"><h3>3. Brand / Visual</h3><span class="hint">No se inventa el logo</span></div>
            <div class="stack">
              <label class="form-field"><span>Official Logo URL (optional)</span><input id="mcsLogoUrl" class="input" placeholder="URL del logo oficial DGL"></label>
              <label class="form-field"><span>Hero Image URL (optional)</span><input id="mcsHeroUrl" class="input" placeholder="URL de imagen aprobada para esta campaña"></label>
              <div class="grid-2">
                <label class="form-field"><span>Sender Name</span><input id="mcsSenderName" class="input" value="DGL Freight Broker"></label>
                <label class="form-field"><span>Reply-To</span><input id="mcsReplyTo" class="input" placeholder="email@dglus.com"></label>
              </div>
            </div>
          </div>
        </div>

        <div class="stack" style="position:sticky;top:88px">
          <div class="card card-pad">
            <div class="flex justify-between items-center">
              <div>
                <div class="eyebrow">Live Preview</div>
                <strong id="mcsPreviewSubject" style="display:block;margin-top:5px"></strong>
              </div>
              <div class="flex gap-2">
                <button class="btn btn-sm" data-mcs-device="desktop"><i data-lucide="monitor"></i></button>
                <button class="btn btn-sm" data-mcs-device="mobile"><i data-lucide="smartphone"></i></button>
              </div>
            </div>
            <div id="mcsFrameWrap" style="margin-top:14px;background:#e7e9ef;padding:14px;border-radius:12px;overflow:auto">
              <iframe id="mcsPreview" title="Email preview" style="width:100%;height:670px;border:0;background:#fff;border-radius:8px"></iframe>
            </div>
          </div>

          <div class="card card-pad">
            <div class="section-heading" style="margin-top:0"><h3>4. Execution</h3><span class="hint">Draft-first</span></div>
            <div class="stack">
              <button class="btn" data-mcs-action="save"><i data-lucide="save"></i>Guardar campaña</button>
              <button class="btn" data-mcs-action="test"><i data-lucide="send"></i>Crear borrador de prueba</button>
              <button class="btn btn-primary" data-mcs-action="drafts"><i data-lucide="mail-plus"></i>Crear Gmail Drafts del Audience</button>
            </div>
            <p class="text-muted" style="font-size:11px;margin-top:12px">La V3 trabaja en modo Draft-first. No envía automáticamente a toda la audiencia desde el frontend.</p>
          </div>
        </div>
      </div>
    `;

    applyPreset("Reactivation");
    if (global.lucide) global.lucide.createIcons();
  }

  async function backendAction(action, payload) {
    // Uses existing Apps Script bridge when its generic list/upsert API is available.
    if (!API() || typeof API().upsert !== "function") {
      throw new Error("Apps Script no está conectado.");
    }
    if (action === "save") {
      const id = "MKT-" + Date.now().toString(36).toUpperCase();
      await API().upsert("marketingCampaigns", Object.assign({ id, status:"Draft" }, payload));
      return { ok:true, id };
    }
    // Draft/test operations are routed through the generic marketingQueue module.
    const id = "JOB-" + Date.now().toString(36).toUpperCase();
    await API().upsert("marketingQueue", {
      id,
      jobType: action === "test" ? "TEST_DRAFT" : "AUDIENCE_DRAFTS",
      status: "Pending",
      payload: JSON.stringify(payload),
      createdAt: new Date().toISOString()
    });
    if (typeof API().runAutomation === "function") await API().runAutomation();
    return { ok:true, id };
  }

  document.addEventListener("input", function(e) {
    if (e.target && e.target.closest && e.target.closest("#mainContent")) {
      if (String(e.target.id || "").startsWith("mcs")) updatePreview();
    }
  });

  document.addEventListener("change", function(e) {
    if (e.target && e.target.id === "mcsCampaignType") applyPreset(e.target.value);
    if (e.target && String(e.target.id || "").startsWith("mcs")) updatePreview();
  });

  document.addEventListener("click", function(e) {
    const device = e.target.closest("[data-mcs-device]");
    if (device) {
      e.preventDefault();
      const wrap = document.getElementById("mcsFrameWrap");
      if (wrap) wrap.style.maxWidth = device.dataset.mcsDevice === "mobile" ? "390px" : "100%";
      return;
    }

    const btn = e.target.closest("[data-mcs-action]");
    if (!btn) return;
    e.preventDefault();
    const action = btn.dataset.mcsAction;
    const payload = campaignPayload();
    const toast = global.DGL_INTERACTIONS && global.DGL_INTERACTIONS.toast;
    btn.disabled = true;
    Promise.resolve()
      .then(async () => {
        if (action === "save") {
          await backendAction("save", payload);
          if (toast) toast("Campaña guardada en el backend.");
        } else if (action === "test") {
          await backendAction("test", payload);
          if (toast) toast("Solicitud de borrador de prueba creada.");
        } else if (action === "drafts") {
          if (!payload.audienceId) throw new Error("Selecciona primero una audiencia NOVA.");
          await backendAction("drafts", payload);
          if (toast) toast("Solicitud de Gmail Drafts creada para la audiencia.");
        }
      })
      .catch(err => {
        if (toast) toast(err.message, "error");
        else alert(err.message);
      })
      .finally(() => { btn.disabled = false; });
  });

  global.DGL_MODULE_RENDERERS = global.DGL_MODULE_RENDERERS || {};
  global.DGL_MODULE_RENDERERS["campaign-studio"] = render;
  global.DGL_CAMPAIGN_STUDIO = { VERSION, TEMPLATES, COPY_PRESETS, render, emailHtml };
})(window);
