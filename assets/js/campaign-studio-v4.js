/**
 * DGL Campaign Studio V4 — Creative Conversion Engine
 * Strategy -> Creative System -> Copy -> Sequence -> Preview -> Draft orchestration.
 */
(function (global) {
  "use strict";

  const VERSION = "4.0";
  const Lib = () => global.DGL_CREATIVE_LIBRARY_V4;
  const Copy = () => global.DGL_COPY_ENGINE_V4;
  const Seq = () => global.DGL_CAMPAIGN_SEQUENCES_V4;
  const API = () => global.DGL_API || {};

  const esc = (v) => String(v == null ? "" : v)
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");

  const state = {
    device: "desktop",
    generated: null,
    approved: false
  };

  function injectStyles() {
    if (document.getElementById("dglCampaignStudioV4Css")) return;
    const style = document.createElement("style");
    style.id = "dglCampaignStudioV4Css";
    style.textContent = `
      .v4-grid{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(430px,.88fr);gap:18px;align-items:start}
      .v4-stack{display:flex;flex-direction:column;gap:16px}
      .v4-card{background:var(--surface,#151b2d);border:1px solid var(--border,#283046);border-radius:16px;padding:18px}
      .v4-titlebar{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px}
      .v4-titlebar h3{font-size:14px;margin:0;color:#fff}.v4-titlebar p{font-size:11px;margin:3px 0 0;color:#7d879c}
      .v4-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .v4-field{display:flex;flex-direction:column;gap:6px}.v4-field>span{font-size:11px;font-weight:700;color:#cbd3e4}
      .v4-input{width:100%;background:#20283d;border:1px solid #343d55;border-radius:9px;padding:10px 11px;color:#fff;font:inherit;outline:none}
      .v4-input:focus{border-color:#77B82A;box-shadow:0 0 0 2px rgba(119,184,42,.12)}
      textarea.v4-input{resize:vertical;min-height:76px;line-height:1.5}
      .v4-systems{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:8px}
      .v4-system{border:1px solid #303950;background:#171e31;border-radius:11px;padding:11px;cursor:pointer;min-height:92px;transition:.16s ease}
      .v4-system:hover{transform:translateY(-1px);border-color:#53617e}
      .v4-system.active{border-color:#77B82A;background:rgba(119,184,42,.09);box-shadow:0 0 0 1px rgba(119,184,42,.12)}
      .v4-system strong{display:block;color:#fff;font-size:11.5px}.v4-system span{display:block;color:#7f899f;font-size:9.5px;line-height:1.35;margin-top:5px}
      .v4-personalize{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
      .v4-check{display:flex;align-items:center;gap:7px;padding:9px 10px;border:1px solid #2e364c;border-radius:9px;background:#171d2e;font-size:10.5px;color:#c7cede}
      .v4-generate{width:100%;height:46px;border:0;border-radius:11px;background:#77B82A;color:#071106;font-weight:900;letter-spacing:.02em;cursor:pointer;box-shadow:0 10px 28px rgba(119,184,42,.2)}
      .v4-generate:hover{filter:brightness(1.05)}
      .v4-meta{display:flex;gap:7px;flex-wrap:wrap}.v4-chip{font-size:9.5px;padding:5px 8px;border-radius:999px;border:1px solid #30394f;color:#aeb7ca;background:#141a2a}
      .v4-chip.good{border-color:rgba(119,184,42,.45);color:#91d33c;background:rgba(119,184,42,.08)}
      .v4-preview-card{position:sticky;top:84px}
      .v4-preview-shell{background:#e8ebf1;border-radius:13px;padding:12px;overflow:auto;transition:.2s}
      .v4-preview-shell.mobile{max-width:390px;margin:0 auto}
      .v4-preview-shell iframe{display:block;width:100%;height:720px;border:0;border-radius:9px;background:#fff}
      .v4-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px}.v4-actions .btn-primary{grid-column:1/-1}
      .v4-sequence{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
      .v4-seq-step{border:1px solid #2e364b;border-radius:10px;padding:11px;background:#161d2f;min-height:100px}
      .v4-seq-step .day{font-size:9px;color:#77B82A;font-weight:800;text-transform:uppercase}.v4-seq-step strong{display:block;color:#fff;font-size:11px;margin:5px 0}.v4-seq-step p{font-size:9.5px;color:#8993a8;line-height:1.4;margin:0}
      .v4-copy-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .v4-visual-brief{padding:11px;border:1px dashed #3b465f;border-radius:9px;background:#141a29;color:#8d98ae;font-size:10px;line-height:1.45}
      .v4-status{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px 12px;border-radius:10px;background:#111827;border:1px solid #283147}
      .v4-status strong{font-size:10.5px;color:#fff}.v4-status span{font-size:9.5px;color:#7f899e}
      @media(max-width:1180px){.v4-grid{grid-template-columns:1fr}.v4-preview-card{position:static}.v4-systems{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:760px){.v4-form-grid,.v4-copy-grid{grid-template-columns:1fr}.v4-systems{grid-template-columns:1fr 1fr}.v4-personalize{grid-template-columns:1fr 1fr}.v4-sequence{grid-template-columns:1fr}.v4-actions{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function value(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }
  function checked(id) {
    const el = document.getElementById(id);
    return !!(el && el.checked);
  }

  function audiences() {
    if (global.DGL_MARKETING_CAMPAIGN_OS && global.DGL_MARKETING_CAMPAIGN_OS.buildAudiences) {
      return global.DGL_MARKETING_CAMPAIGN_OS.buildAudiences();
    }
    return [];
  }

  function optionList(obj) {
    return Object.values(obj).map(x => `<option value="${esc(x.id || x.label || x.name)}">${esc(x.name || x.label)}</option>`).join("");
  }

  function objectiveOptions() {
    return Object.keys(Lib().OBJECTIVES).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");
  }
  function serviceOptions() {
    return Object.keys(Lib().SERVICES).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");
  }
  function toneOptions() {
    return Object.keys(Lib().TONES).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");
  }
  function ctaOptions() {
    return Object.keys(Lib().CTA_INTENTS).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");
  }

  function strategy() {
    const selectedSystem = document.querySelector(".v4-system.active");
    return {
      campaignName: value("v4CampaignName"),
      objective: value("v4Objective") || "Reactivation",
      audienceId: value("v4Audience"),
      service: value("v4Service") || "FTL",
      language: value("v4Language") || "Spanish",
      creativeSystem: selectedSystem ? selectedSystem.dataset.system : "relationship-premium",
      angle: value("v4Angle"),
      tone: value("v4Tone") || "Executive Natural",
      ctaIntent: value("v4CtaIntent") || "Generate Quote",
      personalizeFirstName: checked("v4PFirst"),
      personalizeCompany: checked("v4PCompany"),
      personalizeService: checked("v4PService"),
      personalizeLastQuote: checked("v4PLastQuote"),
      personalizeLane: checked("v4PLane"),
      personalizeRevenue: checked("v4PRevenue")
    };
  }

  function updateAngles() {
    const objective = value("v4Objective") || "Reactivation";
    const cfg = Lib().OBJECTIVES[objective];
    const select = document.getElementById("v4Angle");
    if (!select || !cfg) return;
    select.innerHTML = cfg.allowedAngles.map(a=>`<option value="${esc(a)}">${esc(a)}</option>`).join("");
    select.value = cfg.defaultAngle;
    const cta = document.getElementById("v4CtaIntent");
    if (cta) cta.value = cfg.defaultCtaIntent;
  }

  function recommendSystem(force=false) {
    const objective = value("v4Objective") || "Reactivation";
    const rec = Lib().OBJECTIVES[objective].recommendedSystem;
    const current = document.querySelector(".v4-system.active");
    if (!force && current && current.dataset.userSelected === "1") return;
    document.querySelectorAll(".v4-system").forEach(el => el.classList.toggle("active", el.dataset.system === rec));
  }

  function generate() {
    const s = strategy();
    state.generated = Copy().generate(s);
    state.approved = false;
    fillCopy(state.generated);
    renderSequence();
    updatePreview();
    updateStatus();
  }

  function fillCopy(c) {
    const set = (id,val) => { const e=document.getElementById(id); if(e)e.value=val||""; };
    set("v4SubjectA", c.subjectA);
    set("v4SubjectB", c.subjectB);
    set("v4Preheader", c.preheader);
    set("v4Headline", c.headline);
    set("v4Body", c.body);
    set("v4Body2", c.body2);
    set("v4Cta", c.cta);
    set("v4VisualBrief", c.visualBrief);
  }

  function currentCopy() {
    return {
      subjectA:value("v4SubjectA"), subjectB:value("v4SubjectB"), preheader:value("v4Preheader"),
      headline:value("v4Headline"), body:value("v4Body"), body2:value("v4Body2"), cta:value("v4Cta"),
      ctaUrl:value("v4CtaUrl"), heroUrl:value("v4HeroUrl"), logoUrl:value("v4LogoUrl"),
      visualBrief:value("v4VisualBrief")
    };
  }

  function mergeSample(text, s) {
    const sample = {
      firstName:"Laura",
      company:"ABC Logistics",
      service:s.service || "FTL",
      lane:"Houston, TX → Dallas, TX"
    };
    return String(text || "")
      .replaceAll("{{firstName}}",sample.firstName)
      .replaceAll("{{company}}",sample.company)
      .replaceAll("{{service}}",sample.service)
      .replaceAll("{{lane}}",sample.lane);
  }

  function brandText(textColor, green) {
    return `<div style="font-family:Arial,sans-serif;font-size:24px;font-weight:900;letter-spacing:.5px;color:${textColor};">DGL <span style="font-size:10px;letter-spacing:2px;color:${green};font-weight:800;">FREIGHT BROKER</span></div>`;
  }

  function emailHtml() {
    const s = strategy();
    const c = currentCopy();
    const system = Lib().CREATIVE_SYSTEMS[s.creativeSystem] || Lib().CREATIVE_SYSTEMS["relationship-premium"];
    const svc = Lib().SERVICES[s.service] || Lib().SERVICES.Multiservicio;
    const green="#77B82A", navy="#05035C", dark="#080c19", dark2="#0d1427", white="#ffffff";
    const isLight = system.mode === "light";
    const bg = isLight ? "#eef1f5" : "#050711";
    const card = isLight ? "#ffffff" : "#0a1020";
    const text = isLight ? "#111827" : "#ffffff";
    const muted = isLight ? "#5f6878" : "#b3bdd0";
    const border = isLight ? "#dfe4eb" : "#242d43";
    const headline = mergeSample(c.headline, s);
    const body = mergeSample(c.body, s);
    const body2 = mergeSample(c.body2, s);
    const preheader = mergeSample(c.preheader, s);
    const cta = mergeSample(c.cta, s);
    const heroImg = c.heroUrl ? `<img src="${esc(c.heroUrl)}" alt="" width="100%" style="display:block;width:100%;height:auto;max-height:330px;object-fit:cover;border:0;">` : "";
    const logo = c.logoUrl ? `<img src="${esc(c.logoUrl)}" alt="DGL Freight Broker" style="display:block;max-width:190px;max-height:70px;border:0;">` : brandText(text,green);
    const proof = svc.proof.map(p=>`<td style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:${muted};padding:0 12px 0 0;">${esc(p)}</td>`).join("");

    if (system.layout === "minimal") {
      return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f5f7;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5f7;"><tr><td align="center" style="padding:32px 12px;">
        <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#fff;border:1px solid #e0e4ea;border-radius:16px;">
          <tr><td style="padding:28px 34px 20px;">${logo}</td></tr>
          <tr><td style="padding:18px 34px 36px;font-family:Arial,sans-serif;">
            <div style="font-size:12px;color:${green};font-weight:800;letter-spacing:1.4px;">QUOTE RECOVERY</div>
            <div style="font-size:30px;line-height:1.12;font-weight:900;color:#111827;margin-top:12px;">${esc(headline)}</div>
            <p style="font-size:16px;line-height:1.65;color:#4f5969;margin:23px 0 0;">${esc(body)}</p>
            <p style="font-size:16px;line-height:1.65;color:#4f5969;margin:10px 0 0;">${esc(body2)}</p>
            <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:26px;"><tr><td bgcolor="${green}" style="border-radius:8px;">
              <a href="${esc(c.ctaUrl||"#")}" style="display:inline-block;padding:14px 22px;font-family:Arial,sans-serif;font-size:13px;font-weight:900;color:#071105;text-decoration:none;">${esc(cta)} →</a>
            </td></tr></table>
          </td></tr>
          <tr><td style="border-top:1px solid #e3e7ed;padding:20px 34px;font-family:Arial,sans-serif;font-size:11px;color:#7b8493;">DGL Freight Broker · Your inland freight partner.</td></tr>
        </table></td></tr></table></body></html>`;
    }

    if (system.layout === "executive") {
      return `<!doctype html><html><body style="margin:0;padding:0;background:#eef1f4;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef1f4;"><tr><td align="center" style="padding:30px 12px;">
        <table role="presentation" width="660" cellspacing="0" cellpadding="0" style="width:100%;max-width:660px;background:#fff;border:1px solid #dde2e9;border-radius:14px;overflow:hidden;">
          <tr><td style="padding:28px 38px;">${logo}</td></tr>
          <tr><td style="padding:14px 38px 42px;font-family:Arial,sans-serif;">
            <div style="width:42px;height:4px;background:${green};border-radius:4px;margin-bottom:22px;"></div>
            <div style="font-size:32px;line-height:1.12;font-weight:900;color:#111827;letter-spacing:-.3px;">${esc(headline)}</div>
            <p style="font-size:16px;line-height:1.7;color:#566071;margin:24px 0 0;">${esc(body)}</p>
            <p style="font-size:16px;line-height:1.7;color:#566071;margin:10px 0 0;">${esc(body2)}</p>
            <div style="margin-top:26px;"><a href="${esc(c.ctaUrl||"#")}" style="font-family:Arial,sans-serif;font-size:13px;font-weight:900;color:${navy};text-decoration:none;border-bottom:2px solid ${green};padding-bottom:3px;">${esc(cta)} →</a></div>
          </td></tr>
          <tr><td style="background:#fafbfc;border-top:1px solid #e6e9ee;padding:20px 38px;"><table role="presentation" cellspacing="0" cellpadding="0"><tr>${proof}</tr></table></td></tr>
        </table></td></tr></table></body></html>`;
    }

    const heroFallback = system.layout === "hero" || system.layout === "momentum"
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${system.layout==="momentum" ? green : navy};"><tr>
          <td style="padding:34px 38px;font-family:Arial,sans-serif;">
            <div style="font-size:11px;font-weight:900;letter-spacing:2px;color:${system.layout==="momentum" ? "#071105" : green};">${esc(svc.visualLabel)}</div>
            <div style="font-size:44px;line-height:1;font-weight:900;color:#fff;margin-top:11px;letter-spacing:-1px;">${esc(svc.name)}</div>
            <div style="font-size:12px;color:${system.layout==="momentum" ? "#15340c" : "#c1cadb"};margin-top:8px;">${esc(svc.descriptor)}</div>
          </td></tr></table>` : "";

    return `<!doctype html><html><body style="margin:0;padding:0;background:${bg};">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${bg};"><tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="680" cellspacing="0" cellpadding="0" style="width:100%;max-width:680px;background:${card};border:1px solid ${border};border-radius:18px;overflow:hidden;">
        <tr><td style="padding:27px 36px;border-bottom:1px solid ${border};">${logo}</td></tr>
        ${heroImg ? `<tr><td>${heroImg}</td></tr>` : heroFallback}
        <tr><td style="padding:40px 38px 36px;font-family:Arial,sans-serif;color:${text};">
          <div style="font-size:10px;font-weight:900;letter-spacing:1.8px;color:${green};">${esc(s.objective.toUpperCase())}</div>
          <div style="font-size:35px;line-height:1.06;font-weight:900;color:${text};margin-top:13px;letter-spacing:-.6px;">${esc(headline)}</div>
          <p style="font-size:16px;line-height:1.66;color:${muted};margin:25px 0 0;">${esc(body)}</p>
          <p style="font-size:16px;line-height:1.66;color:${muted};margin:10px 0 0;">${esc(body2)}</p>
          <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:27px;"><tr><td bgcolor="${green}" style="border-radius:9px;">
            <a href="${esc(c.ctaUrl||"#")}" style="display:inline-block;padding:15px 23px;font-family:Arial,sans-serif;font-size:13px;font-weight:900;color:#071105;text-decoration:none;">${esc(cta)} →</a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:20px 38px;border-top:1px solid ${border};"><table role="presentation" cellspacing="0" cellpadding="0"><tr>${proof}</tr></table></td></tr>
      </table></td></tr></table></body></html>`;
  }

  function updatePreview() {
    const frame = document.getElementById("v4Preview");
    if (frame) frame.srcdoc = emailHtml();
    const subject = document.getElementById("v4PreviewSubject");
    if (subject) subject.textContent = mergeSample(value("v4SubjectA"), strategy()) || "Genera una campaña para ver el asunto.";
  }

  function renderSequence() {
    const mount = document.getElementById("v4Sequence");
    if (!mount) return;
    const s = strategy();
    mount.innerHTML = Seq().getSequence(s.objective, s.service, s.language).map(step=>`
      <div class="v4-seq-step">
        <div class="day">DAY ${step.day}</div>
        <strong>${esc(step.type)}</strong>
        <p>${esc(step.purpose)}</p>
      </div>`).join("");
  }

  function updateStatus() {
    const generated = !!state.generated;
    const status = document.getElementById("v4CreativeStatus");
    if (status) {
      status.innerHTML = state.approved
        ? `<strong style="color:#91d33c">Creative approved</strong><span>Listo para test draft / backend</span>`
        : generated
          ? `<strong>Creative generated</strong><span>Revisa copy, diseño y secuencia antes de aprobar</span>`
          : `<strong>Creative not generated</strong><span>Define estrategia y genera la campaña</span>`;
    }
    const approve = document.querySelector('[data-v4-action="approve"]');
    if (approve) approve.disabled = !generated;
  }

  function payloadForBackend() {
    return { ...strategy(), ...currentCopy(), sequence: Seq().getSequence(strategy().objective, strategy().service, strategy().language), status: state.approved ? "Approved" : "Draft" };
  }

  async function requestDraft(kind) {
    const api = API();
    if (!api || typeof api.upsert !== "function") {
      throw new Error("Backend privado todavía no está conectado. El diseño sí está listo para prueba.");
    }
    const id = "MKT-" + Date.now().toString(36).toUpperCase();
    await api.upsert("marketingCampaigns", { id, ...payloadForBackend() });
    await api.upsert("marketingQueue", {
      id:"JOB-" + Date.now().toString(36).toUpperCase(),
      jobType:kind === "test" ? "TEST_DRAFT" : "AUDIENCE_DRAFTS",
      status:"Pending",
      payload:JSON.stringify(payloadForBackend()),
      createdAt:new Date().toISOString()
    });
    if (typeof api.runAutomation === "function") await api.runAutomation();
  }

  function render(container) {
    injectStyles();
    const aud = audiences();
    const systems = Object.values(Lib().CREATIVE_SYSTEMS);

    container.innerHTML = `
      <div class="page-head">
        <div>
          <div class="eyebrow">Campaign Studio</div>
          <h2>DGL Campaign Studio V4</h2>
          <p class="lede">Estrategia → sistema creativo → copy → secuencia → diseño → aprobación.</p>
        </div>
        <div class="page-head-actions">
          <span class="badge badge-success">CREATIVE CONVERSION ENGINE · V${VERSION}</span>
        </div>
      </div>

      <div class="v4-grid">
        <div class="v4-stack">

          <div class="v4-card">
            <div class="v4-titlebar">
              <div><h3>1. Campaign Strategy</h3><p>Qué queremos lograr y con qué audiencia.</p></div>
              <div class="v4-meta"><span class="v4-chip good">ACCOUNT-LED</span><span class="v4-chip">DRAFT-FIRST</span></div>
            </div>
            <div class="v4-form-grid">
              <label class="v4-field"><span>Campaign Name</span><input id="v4CampaignName" class="v4-input" value="Reactivation FTL · 60 Days"></label>
              <label class="v4-field"><span>Campaign Objective</span><select id="v4Objective" class="v4-input">${objectiveOptions()}</select></label>
              <label class="v4-field"><span>NOVA Audience</span><select id="v4Audience" class="v4-input">
                <option value="">Seleccionar audiencia</option>
                ${aud.map(a=>`<option value="${esc(a.id)}">${esc(a.name)} · ${a.count} registros</option>`).join("")}
              </select></label>
              <label class="v4-field"><span>Service</span><select id="v4Service" class="v4-input">${serviceOptions()}</select></label>
              <label class="v4-field"><span>Language</span><select id="v4Language" class="v4-input"><option>Spanish</option><option>English</option></select></label>
              <label class="v4-field"><span>Message Angle</span><select id="v4Angle" class="v4-input"></select></label>
            </div>
          </div>

          <div class="v4-card">
            <div class="v4-titlebar">
              <div><h3>2. Creative Strategy</h3><p>El diseño cambia según el objetivo; no es solo color.</p></div>
              <span class="v4-chip">5 SYSTEMS</span>
            </div>
            <div class="v4-systems">
              ${systems.map((s,i)=>`
                <div class="v4-system ${i===0?"active":""}" data-system="${esc(s.id)}">
                  <strong>${esc(s.name)}</strong>
                  <span>${esc(s.description)}</span>
                </div>`).join("")}
            </div>
            <div class="v4-form-grid" style="margin-top:12px">
              <label class="v4-field"><span>Copy Tone</span><select id="v4Tone" class="v4-input">${toneOptions()}</select></label>
              <label class="v4-field"><span>CTA Intent</span><select id="v4CtaIntent" class="v4-input">${ctaOptions()}</select></label>
            </div>
          </div>

          <div class="v4-card">
            <div class="v4-titlebar">
              <div><h3>3. Personalization Guardrails</h3><p>Qué variables puede usar la campaña.</p></div>
              <span class="v4-chip">CONTROLLED</span>
            </div>
            <div class="v4-personalize">
              <label class="v4-check"><input id="v4PFirst" type="checkbox" checked> First Name</label>
              <label class="v4-check"><input id="v4PCompany" type="checkbox" checked> Company</label>
              <label class="v4-check"><input id="v4PService" type="checkbox" checked> Service</label>
              <label class="v4-check"><input id="v4PLastQuote" type="checkbox"> Last Quote Context</label>
              <label class="v4-check"><input id="v4PLane" type="checkbox"> Relevant Lane</label>
              <label class="v4-check"><input id="v4PRevenue" type="checkbox" disabled> Sensitive Revenue</label>
            </div>
            <button class="v4-generate" data-v4-action="generate" style="margin-top:14px">GENERATE CAMPAIGN</button>
            <div style="text-align:center;margin-top:7px;font-size:9.5px;color:#6f7a91">Creative Rules V4 · AI-ready. No external AI call is made yet.</div>
          </div>

          <div class="v4-card">
            <div class="v4-titlebar">
              <div><h3>4. Message</h3><p>Dos asuntos + mensaje maestro editable.</p></div>
              <div class="v4-meta"><span class="v4-chip">A/B SUBJECT</span><span class="v4-chip">MASTER COPY</span></div>
            </div>
            <div class="v4-copy-grid">
              <label class="v4-field"><span>Subject A</span><input id="v4SubjectA" class="v4-input"></label>
              <label class="v4-field"><span>Subject B</span><input id="v4SubjectB" class="v4-input"></label>
            </div>
            <div class="v4-stack" style="gap:10px;margin-top:10px">
              <label class="v4-field"><span>Preheader</span><input id="v4Preheader" class="v4-input"></label>
              <label class="v4-field"><span>Headline</span><input id="v4Headline" class="v4-input"></label>
              <label class="v4-field"><span>Body</span><textarea id="v4Body" class="v4-input"></textarea></label>
              <label class="v4-field"><span>Body 2</span><textarea id="v4Body2" class="v4-input"></textarea></label>
              <div class="v4-copy-grid">
                <label class="v4-field"><span>CTA</span><input id="v4Cta" class="v4-input"></label>
                <label class="v4-field"><span>CTA URL</span><input id="v4CtaUrl" class="v4-input" placeholder="https://..."></label>
              </div>
            </div>
          </div>

          <div class="v4-card">
            <div class="v4-titlebar">
              <div><h3>5. Visual Direction</h3><p>Hero opcional + brief creativo específico al servicio.</p></div>
              <span class="v4-chip">NO FAKE LOGO</span>
            </div>
            <div class="v4-copy-grid">
              <label class="v4-field"><span>Official Logo URL</span><input id="v4LogoUrl" class="v4-input" placeholder="URL del logo oficial aprobado"></label>
              <label class="v4-field"><span>Hero Image URL</span><input id="v4HeroUrl" class="v4-input" placeholder="URL de imagen aprobada"></label>
            </div>
            <label class="v4-field" style="margin-top:10px"><span>Visual Brief</span><textarea id="v4VisualBrief" class="v4-input" rows="3"></textarea></label>
            <div class="v4-visual-brief" style="margin-top:10px">Si no hay hero aprobado, Service Hero utiliza un bloque gráfico del servicio para que el email siga teniendo diseño sin inventar imágenes ni logos.</div>
          </div>

          <div class="v4-card">
            <div class="v4-titlebar">
              <div><h3>6. Recommended Sequence</h3><p>La campaña es una secuencia, no un solo email.</p></div>
              <span class="v4-chip">STOP ON REPLY / RFQ / LOAD</span>
            </div>
            <div id="v4Sequence" class="v4-sequence"></div>
          </div>
        </div>

        <div class="v4-stack v4-preview-card">
          <div class="v4-card">
            <div class="v4-titlebar">
              <div>
                <div class="eyebrow">Live Preview</div>
                <h3 id="v4PreviewSubject" style="margin-top:7px">Genera una campaña para comenzar.</h3>
              </div>
              <div class="flex gap-2">
                <button class="btn btn-sm" data-v4-device="desktop"><i data-lucide="monitor"></i></button>
                <button class="btn btn-sm" data-v4-device="mobile"><i data-lucide="smartphone"></i></button>
              </div>
            </div>
            <div id="v4PreviewShell" class="v4-preview-shell">
              <iframe id="v4Preview" title="Campaign email preview"></iframe>
            </div>
          </div>

          <div class="v4-card">
            <div class="v4-titlebar">
              <div><h3>Creative Approval</h3><p>Primero diseño. Después datos reales.</p></div>
            </div>
            <div id="v4CreativeStatus" class="v4-status"></div>
            <div class="v4-actions" style="margin-top:11px">
              <button class="btn" data-v4-action="test"><i data-lucide="mail"></i> Create Test Draft</button>
              <button class="btn" data-v4-action="approve"><i data-lucide="check-circle"></i> Approve Creative</button>
              <button class="btn btn-primary" data-v4-action="audience"><i data-lucide="send"></i> Create Audience Drafts</button>
            </div>
            <p style="font-size:9.5px;color:#6f7a91;line-height:1.45;margin:10px 0 0">Test/Audience Drafts requieren el backend privado de Apps Script. Esta versión pública nunca guarda datos de clientes.</p>
          </div>
        </div>
      </div>
    `;

    updateAngles();
    recommendSystem(true);
    generate();
    if (global.lucide) global.lucide.createIcons();
  }

  document.addEventListener("click", function(e) {
    const sys = e.target.closest(".v4-system");
    if (sys) {
      document.querySelectorAll(".v4-system").forEach(x=>{x.classList.remove("active");x.dataset.userSelected="0";});
      sys.classList.add("active"); sys.dataset.userSelected="1";
      updatePreview();
      return;
    }

    const dev = e.target.closest("[data-v4-device]");
    if (dev) {
      const sh = document.getElementById("v4PreviewShell");
      state.device = dev.dataset.v4Device;
      if (sh) sh.classList.toggle("mobile", state.device === "mobile");
      return;
    }

    const action = e.target.closest("[data-v4-action]");
    if (!action) return;
    const toast = global.DGL_INTERACTIONS && global.DGL_INTERACTIONS.toast;

    if (action.dataset.v4Action === "generate") {
      generate();
      if (toast) toast("Campaña generada con Creative Rules V4.");
    }
    if (action.dataset.v4Action === "approve") {
      state.approved = true; updateStatus();
      if (toast) toast("Creative aprobado.");
    }
    if (action.dataset.v4Action === "test" || action.dataset.v4Action === "audience") {
      const kind = action.dataset.v4Action;
      requestDraft(kind).then(()=>{
        if (toast) toast(kind==="test" ? "Test draft solicitado." : "Audience drafts solicitados.");
      }).catch(err=>{
        if (toast) toast(err.message,"error"); else alert(err.message);
      });
    }
  });

  document.addEventListener("change", function(e) {
    if (!e.target || !String(e.target.id||"").startsWith("v4")) return;
    if (e.target.id === "v4Objective") {
      updateAngles();
      recommendSystem(true);
      generate();
      return;
    }
    if (["v4Service","v4Language","v4Angle","v4Tone","v4CtaIntent"].includes(e.target.id)) {
      generate();
      return;
    }
    updatePreview();
    renderSequence();
  });

  document.addEventListener("input", function(e) {
    if (!e.target || !String(e.target.id||"").startsWith("v4")) return;
    if (["v4SubjectA","v4SubjectB","v4Preheader","v4Headline","v4Body","v4Body2","v4Cta","v4CtaUrl","v4HeroUrl","v4LogoUrl"].includes(e.target.id)) {
      updatePreview();
    }
  });

  global.DGL_MODULE_RENDERERS = global.DGL_MODULE_RENDERERS || {};
  global.DGL_MODULE_RENDERERS["campaign-studio"] = render;
  global.DGL_CAMPAIGN_STUDIO_V4 = { VERSION, render, emailHtml, strategy };
})(window);
