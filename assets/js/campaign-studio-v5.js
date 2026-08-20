
(function(global){
  "use strict";
  const esc=v=>String(v==null?"":v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
  const Lib=()=>global.DGL_CREATIVE_LIBRARY_V5;
  const Copy=()=>global.DGL_COPY_ENGINE_V5;
  const Seq=()=>global.DGL_CAMPAIGN_SEQUENCES_V4;
  const API=()=>global.DGL_API||{};

  const state={device:"desktop",approved:false,generated:null,incoming:null};

  function audiences(){
    try{return global.DGL_MARKETING_CAMPAIGN_OS.buildAudiences()}catch(_){return[]}
  }
  function value(id){const e=document.getElementById(id);return e?String(e.value||"").trim():""}
  function checked(id){const e=document.getElementById(id);return !!(e&&e.checked)}

  function readIncoming(){
    try{
      const x=JSON.parse(sessionStorage.getItem("dgl_v5_campaign_context")||"null");
      state.incoming=x;return x;
    }catch(_){return null}
  }

  function systemId(){
    const e=document.querySelector(".v5-creative-card.active");return e?e.dataset.system:"editorial-white";
  }
  function strategy(){
    return {
      campaignName:value("v5CampaignName"),
      objective:value("v5Objective")||"Reactivation",
      audienceId:value("v5Audience"),
      service:value("v5Service")||"FTL",
      language:value("v5Language")||"Spanish",
      angle:value("v5Angle"),
      creativeSystem:systemId(),
      ctaIntent:value("v5CtaIntent")||"Generate Quote",
      qnbWindow:value("v5QnbWindow")||"0-14",
      lane:value("v5Lane"),
      heroUrl:value("v5HeroUrl"),
      logoUrl:value("v5LogoUrl"),
      personalizeFirstName:checked("v5PFirst"),
      personalizeCompany:checked("v5PCompany"),
      personalizeService:checked("v5PService"),
      personalizeLastQuote:checked("v5PLastQuote"),
      personalizeLane:checked("v5PLane")
    };
  }

  function objectiveOptions(){
    return Object.keys(Lib().OBJECTIVES).map(x=>`<option>${esc(x)}</option>`).join("");
  }
  function serviceOptions(){
    return Object.keys(Lib().SERVICES).map(x=>`<option>${esc(x)}</option>`).join("");
  }
  function ctaOptions(){
    return Object.keys(Lib().CTA).map(x=>`<option>${esc(x)}</option>`).join("");
  }

  function syncAngles(){
    const o=value("v5Objective")||"Reactivation", cfg=Lib().OBJECTIVES[o]||Lib().OBJECTIVES.Reactivation;
    const e=document.getElementById("v5Angle");
    if(e){e.innerHTML=cfg.angles.map(a=>`<option>${esc(a)}</option>`).join("");e.value=cfg.defaultAngle}
    const c=document.getElementById("v5CtaIntent");if(c)c.value=cfg.defaultCta;
    const q=document.getElementById("v5QnbWrap");if(q)q.style.display=o==="Quoted Not Booked"?"flex":"none";
  }
  function recommendSystem(){
    const o=value("v5Objective")||"Reactivation";
    const id=(Lib().OBJECTIVES[o]||Lib().OBJECTIVES.Reactivation).recommendedSystem;
    document.querySelectorAll(".v5-creative-card").forEach(x=>x.classList.toggle("active",x.dataset.system===id));
  }

  function applyIncoming(){
    const x=state.incoming||readIncoming();
    if(!x)return;
    const set=(id,v)=>{const e=document.getElementById(id);if(e&&v!=null&&v!=="")e.value=v};
    set("v5CampaignName",x.campaignName);
    set("v5Objective",x.objective);
    set("v5Service",x.service);
    set("v5Audience",x.audienceId);
    set("v5QnbWindow",x.qnbWindow);
    set("v5Lane",x.lane);
    syncAngles();recommendSystem();
    if(x.objective==="Quoted Not Booked"){const e=document.getElementById("v5PLastQuote");if(e)e.checked=true}
    if(x.lane){const e=document.getElementById("v5PLane");if(e)e.checked=true}
  }

  function currentCopy(){
    const g=id=>value(id);
    return {subjectA:g("v5SubjectA"),subjectB:g("v5SubjectB"),preheader:g("v5Preheader"),headline:g("v5Headline"),body:g("v5Body"),body2:g("v5Body2"),cta:g("v5Cta")};
  }
  function sample(text,s){
    return String(text||"").replaceAll("{{firstName}}","Laura").replaceAll("{{company}}","ABC Logistics").replaceAll("{{service}}",s.service||"FTL").replaceAll("{{lane}}",s.lane||"Houston → Dallas");
  }

  function generate(){
    const s=strategy();
    state.generated=Copy().generate(s);state.approved=false;
    const c=state.generated,set=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v||""};
    set("v5SubjectA",c.subjectA);set("v5SubjectB",c.subjectB);set("v5Preheader",c.preheader);
    set("v5Headline",c.headline);set("v5Body",c.body);set("v5Body2",c.body2);set("v5Cta",c.cta);
    renderSequence();updatePreview();updateQA();
  }

  function brandHeader(s,isDark=false){
    if(s.logoUrl){
      return `<img src="${esc(s.logoUrl)}" alt="DGL Freight Broker" style="display:block;max-width:190px;max-height:68px;border:0">`;
    }
    return `<div style="height:42px;display:flex;align-items:center">
      <div style="width:10px;height:10px;background:#77B82A;transform:rotate(45deg);margin-right:11px"></div>
      <div style="font-family:Arial,sans-serif;font-size:11px;font-weight:900;letter-spacing:1.5px;color:${isDark?"#fff":"#05035C"}">OFFICIAL DGL LOGO ASSET</div>
    </div>`;
  }

  function heroAsset(s,height=250){
    if(s.heroUrl) return `<img src="${esc(s.heroUrl)}" alt="" style="display:block;width:100%;height:${height}px;object-fit:cover;border:0">`;
    const svc=Lib().SERVICES[s.service]||Lib().SERVICES.Multiservicio;
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="height:${height}px;background:#E9EEF2">
      <tr><td style="padding:28px;font-family:Arial,sans-serif;vertical-align:bottom">
        <div style="font-size:10px;font-weight:900;letter-spacing:1.6px;color:#77B82A">APPROVED HERO ASSET</div>
        <div style="font-size:29px;line-height:1.02;font-weight:900;color:#05035C;margin-top:8px">${esc(svc.label)}</div>
        <div style="font-size:11px;color:#667085;margin-top:7px">Add an approved DGL logistics photograph in Campaign Studio.</div>
      </td></tr></table>`;
  }

  function emailHtml(){
    const s=strategy(),c=currentCopy(),sys=Lib().CREATIVE_SYSTEMS[s.creativeSystem]||Lib().CREATIVE_SYSTEMS["editorial-white"];
    const service=Lib().SERVICES[s.service]||Lib().SERVICES.Multiservicio;
    const h=sample(c.headline,s),b=sample(c.body,s),b2=sample(c.body2,s),cta=sample(c.cta,s),pre=sample(c.preheader,s);
    const proof=service.proof.map(x=>`<td style="padding:0 12px 0 0;font-family:Arial,sans-serif;font-size:10px;font-weight:800;color:#667085">${esc(x)}</td>`).join("");
    const button=`<table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#77B82A" style="border-radius:7px"><a href="#" style="display:inline-block;padding:14px 21px;font-family:Arial,sans-serif;font-size:12px;font-weight:900;color:#071005;text-decoration:none">${esc(cta)} →</a></td></tr></table>`;

    if(sys.layout==="minimal"){
      return `<!doctype html><html><body style="margin:0;background:#F4F5F7">
      <div style="display:none;max-height:0;overflow:hidden">${esc(pre)}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:34px 12px">
      <table role="presentation" width="620" style="width:100%;max-width:620px;background:#fff;border:1px solid #E5E7EB;border-radius:14px">
        <tr><td style="padding:25px 34px">${brandHeader(s)}</td></tr>
        <tr><td style="padding:18px 34px 38px;font-family:Arial,sans-serif">
          <div style="font-size:9px;color:#77B82A;font-weight:900;letter-spacing:1.4px">QUOTE RECOVERY</div>
          <div style="font-size:32px;line-height:1.08;font-weight:900;color:#05035C;margin-top:13px">${esc(h)}</div>
          <p style="font-size:15px;line-height:1.7;color:#4F5868;margin:23px 0 0">${esc(b)}</p>
          <p style="font-size:15px;line-height:1.7;color:#4F5868;margin:8px 0 24px">${esc(b2)}</p>${button}
        </td></tr>
        <tr><td style="border-top:1px solid #E7E9ED;padding:18px 34px;font-family:Arial,sans-serif;font-size:10px;color:#98A2B3">DGL Freight Broker · Your inland freight partner.</td></tr>
      </table></td></tr></table></body></html>`;
    }

    if(sys.layout==="split"){
      return `<!doctype html><html><body style="margin:0;background:#EFF1F4">
      <div style="display:none;max-height:0;overflow:hidden">${esc(pre)}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:30px 12px">
      <table role="presentation" width="680" style="width:100%;max-width:680px;background:#fff;border-radius:16px;overflow:hidden">
        <tr><td colspan="2" style="padding:24px 32px">${brandHeader(s)}</td></tr>
        <tr>
          <td width="52%" style="background:#05035C;padding:34px 30px;font-family:Arial,sans-serif;vertical-align:top">
            <div style="font-size:9px;color:#9BD54F;font-weight:900;letter-spacing:1.5px">${esc(service.label)}</div>
            <div style="font-size:31px;line-height:1.05;color:#fff;font-weight:900;margin-top:13px">${esc(h)}</div>
            <p style="font-size:14px;line-height:1.65;color:#D2D7E3;margin:21px 0 8px">${esc(b)}</p>
            <p style="font-size:14px;line-height:1.65;color:#D2D7E3;margin:0 0 24px">${esc(b2)}</p>${button}
          </td>
          <td width="48%" style="vertical-align:top">${heroAsset(s,360)}</td>
        </tr>
        <tr><td colspan="2" style="padding:18px 30px;border-top:1px solid #E8EAEE"><table role="presentation"><tr>${proof}</tr></table></td></tr>
      </table></td></tr></table></body></html>`;
    }

    if(sys.layout==="route"){
      return `<!doctype html><html><body style="margin:0;background:#F1F3F6">
      <div style="display:none;max-height:0;overflow:hidden">${esc(pre)}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:30px 12px">
      <table role="presentation" width="680" style="width:100%;max-width:680px;background:#fff;border-radius:16px;overflow:hidden">
        <tr><td style="padding:24px 32px">${brandHeader(s)}</td></tr>
        <tr><td style="background:#07112E;padding:34px 36px;font-family:Arial,sans-serif">
          <div style="font-size:9px;color:#95D54A;font-weight:900;letter-spacing:1.6px">ROUTE INTELLIGENCE</div>
          <div style="font-size:30px;line-height:1.08;color:#fff;font-weight:900;margin-top:12px">${esc(h)}</div>
          <div style="margin:26px 0 4px;border-top:3px dashed #77B82A;position:relative"></div>
          <div style="display:flex;justify-content:space-between;color:#fff;font-size:11px;font-weight:800;margin-top:8px"><span>${esc(s.lane||"ORIGIN")}</span><span>DGL CAPACITY</span></div>
        </td></tr>
        <tr><td style="padding:30px 36px;font-family:Arial,sans-serif">
          <p style="font-size:15px;line-height:1.7;color:#4F5868;margin:0">${esc(b)}</p>
          <p style="font-size:15px;line-height:1.7;color:#4F5868;margin:8px 0 23px">${esc(b2)}</p>${button}
        </td></tr>
      </table></td></tr></table></body></html>`;
    }

    if(sys.layout==="service"){
      return `<!doctype html><html><body style="margin:0;background:#EEF1F4">
      <div style="display:none;max-height:0;overflow:hidden">${esc(pre)}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:30px 12px">
      <table role="presentation" width="680" style="width:100%;max-width:680px;background:#fff;border-radius:16px;overflow:hidden">
        <tr><td style="padding:24px 32px">${brandHeader(s)}</td></tr>
        <tr><td>${heroAsset(s,230)}</td></tr>
        <tr><td style="padding:30px 34px;font-family:Arial,sans-serif">
          <div style="font-size:30px;line-height:1.06;font-weight:900;color:#05035C">${esc(h)}</div>
          <p style="font-size:14px;line-height:1.65;color:#566071;margin:20px 0 8px">${esc(b)}</p>
          <p style="font-size:14px;line-height:1.65;color:#566071;margin:0 0 22px">${esc(b2)}</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:22px"><tr>
          ${service.proof.map(x=>`<td width="33%" style="border-top:3px solid #77B82A;padding:11px 10px 0 0;font-size:10px;font-family:Arial,sans-serif;font-weight:900;color:#05035C">${esc(x)}</td>`).join("")}
          </tr></table>${button}
        </td></tr>
      </table></td></tr></table></body></html>`;
    }

    if(sys.layout==="case"){
      return `<!doctype html><html><body style="margin:0;background:#050916">
      <div style="display:none;max-height:0;overflow:hidden">${esc(pre)}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:30px 12px">
      <table role="presentation" width="680" style="width:100%;max-width:680px;background:#07112E;border-radius:16px;overflow:hidden">
        <tr><td style="padding:25px 34px">${brandHeader(s,true)}</td></tr>
        <tr><td style="padding:24px 34px 12px;font-family:Arial,sans-serif">
          <div style="display:inline-block;background:#77B82A;color:#071005;padding:8px 13px;border-radius:7px;font-size:10px;font-weight:900">CASE / PROOF</div>
          <div style="font-size:31px;line-height:1.08;color:#fff;font-weight:900;margin-top:18px">${esc(h)}</div>
          <p style="font-size:14px;line-height:1.65;color:#D2D7E3;margin:19px 0 8px">${esc(b)}</p>
          <p style="font-size:14px;line-height:1.65;color:#D2D7E3;margin:0 0 23px">${esc(b2)}</p>
        </td></tr>
        <tr><td style="padding:8px 34px 30px"><table role="presentation" width="100%"><tr>
          <td style="border-right:1px solid #29304B;padding:14px;font-family:Arial,sans-serif"><div style="font-size:9px;color:#77B82A;font-weight:900">SOLUTION</div><div style="color:#fff;font-size:12px;margin-top:7px">${esc(s.service)}</div></td>
          <td style="border-right:1px solid #29304B;padding:14px;font-family:Arial,sans-serif"><div style="font-size:9px;color:#77B82A;font-weight:900">RESULT</div><div style="color:#fff;font-size:12px;margin-top:7px">Commercial continuity</div></td>
          <td style="padding:14px;font-family:Arial,sans-serif"><div style="font-size:9px;color:#77B82A;font-weight:900">NEXT STEP</div><div style="color:#fff;font-size:12px;margin-top:7px">${esc(cta)}</div></td>
        </tr></table></td></tr>
      </table></td></tr></table></body></html>`;
    }

    /* editorial default */
    return `<!doctype html><html><body style="margin:0;background:#F1F3F6">
    <div style="display:none;max-height:0;overflow:hidden">${esc(pre)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:30px 12px">
    <table role="presentation" width="680" style="width:100%;max-width:680px;background:#fff;border-radius:16px;overflow:hidden">
      <tr><td colspan="2" style="padding:25px 34px">${brandHeader(s)}</td></tr>
      <tr>
        <td width="58%" style="padding:34px 26px 36px 34px;font-family:Arial,sans-serif;vertical-align:top">
          <div style="width:36px;height:4px;background:#77B82A;border-radius:99px"></div>
          <div style="font-size:34px;line-height:1.05;font-weight:900;color:#05035C;margin-top:19px">${esc(h)}</div>
          <p style="font-size:14px;line-height:1.68;color:#535D6E;margin:22px 0 8px">${esc(b)}</p>
          <p style="font-size:14px;line-height:1.68;color:#535D6E;margin:0 0 24px">${esc(b2)}</p>${button}
        </td>
        <td width="42%" style="vertical-align:bottom">${heroAsset(s,390)}</td>
      </tr>
      <tr><td colspan="2" style="padding:18px 34px;border-top:1px solid #E7E9ED"><table role="presentation"><tr>${proof}</tr></table></td></tr>
    </table></td></tr></table></body></html>`;
  }

  function renderSequence(){
    const mount=document.getElementById("v5Sequence");if(!mount)return;
    const s=strategy(),rows=Seq().getSequence(s.objective,s.service,s.language);
    mount.innerHTML=rows.map(x=>`<div style="display:grid;grid-template-columns:44px 1fr;gap:10px;padding:10px 0;border-bottom:1px solid #ECEFF3">
      <div style="font-size:9px;font-weight:900;color:#77B82A">DAY ${x.day}</div>
      <div><strong style="display:block;font-size:10px;color:#05035C">${esc(x.type)}</strong><span style="display:block;font-size:9px;color:#667085;margin-top:3px">${esc(x.purpose)}</span></div>
    </div>`).join("");
  }

  function updatePreview(){
    const s=strategy(),c=currentCopy(),frame=document.getElementById("v5Preview"),sub=document.getElementById("v5PreviewSubject");
    if(frame)frame.srcdoc=emailHtml();
    if(sub)sub.textContent=sample(c.subjectA,s)||"Generate campaign to preview.";
    const source=document.getElementById("v5SourceValue");
    if(source)source.textContent=state.incoming?`${state.incoming.sourceType} · ${state.incoming.sourceLabel}`:"Manual / Campaign Studio";
    const audience=document.getElementById("v5AudienceValue");
    if(audience)audience.textContent=value("v5Audience")||"Not selected";
    const service=document.getElementById("v5ServiceValue");
    if(service)service.textContent=s.service;
    const objective=document.getElementById("v5ObjectiveValue");
    if(objective)objective.textContent=s.objective;
  }

  function updateQA(){
    const set=(id,on,text)=>{const e=document.getElementById(id);if(e)e.innerHTML=`<i data-lucide="${on?"check-circle-2":"circle"}"></i>${text}`};
    set("qaBrand",!!value("v5LogoUrl"),value("v5LogoUrl")?"Official logo loaded":"Official logo pending");
    set("qaVisual",!!value("v5HeroUrl"),value("v5HeroUrl")?"Hero asset loaded":"Hero optional / pending");
    set("qaCopy",!!value("v5Headline"),"Message generated");
    set("qaApproval",state.approved,state.approved?"Creative approved":"Approval pending");
    if(global.lucide)global.lucide.createIcons();
  }

  function render(container){
    state.incoming=readIncoming();
    const systems=Object.values(Lib().CREATIVE_SYSTEMS), aud=audiences();
    container.innerHTML=`<div class="v5-workspace">
      <div class="v5-topbar">
        <div>
          <div class="v5-kicker">Creative Conversion Engine</div>
          <h1>DGL Campaign Studio V5</h1>
          <p>Convierte una oportunidad validada en una campaña con estrategia, diseño, copy, secuencia y aprobación creativa.</p>
        </div>
        <div class="v5-top-actions">
          ${state.incoming?`<span class="v5-badge green">${esc(state.incoming.area||"")}&nbsp; OPPORTUNITY</span>`:""}
          <a class="v5-btn" href="#/campaign-opportunities"><i data-lucide="arrow-left"></i>Opportunity Center</a>
        </div>
      </div>

      <div class="v5-briefbar">
        <div class="v5-briefcell"><span>Source</span><strong id="v5SourceValue">Manual / Campaign Studio</strong></div>
        <div class="v5-briefcell"><span>Audience</span><strong id="v5AudienceValue">Not selected</strong></div>
        <div class="v5-briefcell"><span>Service</span><strong id="v5ServiceValue">FTL</strong></div>
        <div class="v5-briefcell"><span>Objective</span><strong id="v5ObjectiveValue">Reactivation</strong></div>
      </div>

      <div class="v5-stepper">
        <div class="v5-step active"><span class="num">1</span>Brief</div><div class="v5-step-line"></div>
        <div class="v5-step active"><span class="num">2</span>Creative</div><div class="v5-step-line"></div>
        <div class="v5-step active"><span class="num">3</span>Preview</div><div class="v5-step-line"></div>
        <div class="v5-step"><span class="num">4</span>Approval</div>
      </div>

      <div class="v5-studio-grid">
        <div class="v5-studio-stack">
          <div class="v5-section">
            <div class="v5-section-head"><div><h3>Campaign Brief</h3><p>La estrategia comercial primero. El diseño viene después.</p></div><span class="v5-badge">ACCOUNT-LED</span></div>
            <div class="v5-strategy-grid">
              <div class="v5-field"><label>Campaign Name</label><input id="v5CampaignName" class="v5-input" value="Reactivation FTL"></div>
              <div class="v5-field"><label>Objective</label><select id="v5Objective" class="v5-input">${objectiveOptions()}</select></div>
              <div class="v5-field"><label>NOVA Audience</label><select id="v5Audience" class="v5-input"><option value="">Select audience</option>${aud.map(a=>`<option value="${esc(a.id)}">${esc(a.name)} · ${a.count}</option>`).join("")}</select></div>
              <div class="v5-field"><label>Service</label><select id="v5Service" class="v5-input">${serviceOptions()}</select></div>
              <div class="v5-field"><label>Language</label><select id="v5Language" class="v5-input"><option>Spanish</option><option>English</option></select></div>
              <div class="v5-field"><label>Message Angle</label><select id="v5Angle" class="v5-input"></select></div>
              <div class="v5-field" id="v5QnbWrap" style="display:none"><label>QNB Window</label><select id="v5QnbWindow" class="v5-input"><option value="0-14">0–14 days</option><option value="15-30">15–30 days</option><option value="30+">30+ days</option></select></div>
              <div class="v5-field"><label>Lane / Port / Market</label><input id="v5Lane" class="v5-input" placeholder="Optional"></div>
            </div>
          </div>

          <div class="v5-section">
            <div class="v5-section-head"><div><h3>Creative Direction</h3><p>Basado en el lenguaje visual histórico de DGL, sin copiar piezas anteriores.</p></div><span class="v5-badge green">6 SYSTEMS</span></div>
            <div class="v5-creative-grid">
              ${systems.map(s=>`<div class="v5-creative-card" data-system="${esc(s.id)}">
                <div class="v5-thumb ${esc(s.thumb)}"><span class="accent"></span></div>
                <div class="v5-creative-copy"><strong>${esc(s.name)}</strong><span>${esc(s.use)}</span></div>
              </div>`).join("")}
            </div>
            <div class="v5-strategy-grid" style="margin-top:12px">
              <div class="v5-field"><label>CTA Intent</label><select id="v5CtaIntent" class="v5-input">${ctaOptions()}</select></div>
              <div class="v5-field"><label>Hero Asset URL</label><input id="v5HeroUrl" class="v5-input" placeholder="Approved DGL image URL"></div>
              <div class="v5-field"><label>Official Logo URL</label><input id="v5LogoUrl" class="v5-input" placeholder="Official DGL logo asset"></div>
              <div class="v5-field"><label>Personalization</label><div class="v5-personalization">
                <label class="v5-toggle"><input id="v5PFirst" type="checkbox" checked> First name</label>
                <label class="v5-toggle"><input id="v5PCompany" type="checkbox" checked> Company</label>
                <label class="v5-toggle"><input id="v5PService" type="checkbox" checked> Service</label>
                <label class="v5-toggle"><input id="v5PLastQuote" type="checkbox"> Last quote</label>
                <label class="v5-toggle"><input id="v5PLane" type="checkbox"> Lane</label>
              </div></div>
            </div>
            <button class="v5-generate" data-v5-generate style="margin-top:13px">GENERATE CAMPAIGN</button>
          </div>

          <div class="v5-section">
            <div class="v5-section-head"><div><h3>Message</h3><p>Campaign master. La personalización individual se aplica después.</p></div><span class="v5-badge">A/B SUBJECT</span></div>
            <div class="v5-message-grid">
              <div class="v5-field"><label>Subject A</label><input id="v5SubjectA" class="v5-input"></div>
              <div class="v5-field"><label>Subject B</label><input id="v5SubjectB" class="v5-input"></div>
              <div class="v5-field full"><label>Preheader</label><input id="v5Preheader" class="v5-input"></div>
              <div class="v5-field full"><label>Headline</label><input id="v5Headline" class="v5-input"></div>
              <div class="v5-field full"><label>Body</label><textarea id="v5Body" class="v5-input"></textarea></div>
              <div class="v5-field full"><label>Body 2</label><textarea id="v5Body2" class="v5-input"></textarea></div>
              <div class="v5-field"><label>CTA</label><input id="v5Cta" class="v5-input"></div>
            </div>
          </div>

          <div class="v5-section">
            <div class="v5-section-head"><div><h3>Recommended Sequence</h3><p>Marketing diseña la presión comercial; la secuencia se detiene con respuesta, RFQ o carga.</p></div></div>
            <div id="v5Sequence"></div>
          </div>
        </div>

        <div class="v5-preview-panel">
          <div class="v5-preview-head">
            <div><div class="v5-kicker" style="color:#9BD54F">Live Preview</div><div class="subject" id="v5PreviewSubject">Generate campaign to preview.</div></div>
            <div class="v5-device-toggle"><button class="active" data-v5-device="desktop"><i data-lucide="monitor"></i></button><button data-v5-device="mobile"><i data-lucide="smartphone"></i></button></div>
          </div>
          <div class="v5-email-stage" id="v5EmailStage"><iframe id="v5Preview"></iframe></div>
          <div class="v5-qa">
            <div class="v5-qa-item" id="qaBrand"></div>
            <div class="v5-qa-item" id="qaVisual"></div>
            <div class="v5-qa-item" id="qaCopy"></div>
            <div class="v5-qa-item" id="qaApproval"></div>
          </div>
          <div class="v5-approval-actions">
            <button class="v5-btn" data-v5-test><i data-lucide="mail"></i>Test Draft</button>
            <button class="v5-btn" data-v5-approve><i data-lucide="check-circle"></i>Approve Creative</button>
            <button class="v5-btn primary" data-v5-audience><i data-lucide="send"></i>Create Audience Drafts</button>
          </div>
          <p style="font-size:8.5px;line-height:1.45;color:#7C8499;margin:10px 2px 0">Draft actions require the private Apps Script backend. No customer data is stored in GitHub.</p>
        </div>
      </div>
    </div>`;

    syncAngles();recommendSystem();applyIncoming();generate();updatePreview();updateQA();
    if(global.lucide)global.lucide.createIcons();
  }

  async function requestDraft(kind){
    const api=API();if(!api||typeof api.upsert!=="function")throw new Error("Backend privado todavía no está conectado.");
    const p={...strategy(),...currentCopy(),source:state.incoming||null,status:state.approved?"Approved":"Draft"};
    const id="MKT-"+Date.now().toString(36).toUpperCase();
    await api.upsert("marketingCampaigns",{id,...p});
    await api.upsert("marketingQueue",{id:"JOB-"+Date.now().toString(36).toUpperCase(),jobType:kind,status:"Pending",payload:JSON.stringify(p),createdAt:new Date().toISOString()});
    if(typeof api.runAutomation==="function")await api.runAutomation();
  }

  document.addEventListener("click",e=>{
    const sys=e.target.closest(".v5-creative-card");
    if(sys){document.querySelectorAll(".v5-creative-card").forEach(x=>x.classList.remove("active"));sys.classList.add("active");updatePreview();return}
    const dev=e.target.closest("[data-v5-device]");
    if(dev){
      document.querySelectorAll("[data-v5-device]").forEach(x=>x.classList.toggle("active",x===dev));
      const stage=document.getElementById("v5EmailStage");if(stage)stage.classList.toggle("mobile",dev.dataset.v5Device==="mobile");return;
    }
    if(e.target.closest("[data-v5-generate]")){generate();if(global.DGL_INTERACTIONS?.toast)global.DGL_INTERACTIONS.toast("Campaign generated.");return}
    if(e.target.closest("[data-v5-approve]")){state.approved=true;updateQA();if(global.DGL_INTERACTIONS?.toast)global.DGL_INTERACTIONS.toast("Creative approved.");return}
    if(e.target.closest("[data-v5-test]")){requestDraft("TEST_DRAFT").then(()=>global.DGL_INTERACTIONS?.toast?.("Test draft requested.")).catch(err=>global.DGL_INTERACTIONS?.toast?.(err.message,"error"));return}
    if(e.target.closest("[data-v5-audience]")){requestDraft("AUDIENCE_DRAFTS").then(()=>global.DGL_INTERACTIONS?.toast?.("Audience drafts requested.")).catch(err=>global.DGL_INTERACTIONS?.toast?.(err.message,"error"));return}
  });

  document.addEventListener("change",e=>{
    if(!e.target||!String(e.target.id||"").startsWith("v5"))return;
    if(e.target.id==="v5Objective"){syncAngles();recommendSystem();generate();return}
    if(["v5Service","v5Language","v5Angle","v5CtaIntent","v5QnbWindow"].includes(e.target.id)){generate();return}
    if(e.target.id==="v5Audience"){updatePreview();return}
  });
  document.addEventListener("input",e=>{
    if(!e.target||!String(e.target.id||"").startsWith("v5"))return;
    if(["v5SubjectA","v5SubjectB","v5Preheader","v5Headline","v5Body","v5Body2","v5Cta","v5HeroUrl","v5LogoUrl","v5Lane"].includes(e.target.id)){updatePreview();updateQA()}
  });

  global.DGL_MODULE_RENDERERS=global.DGL_MODULE_RENDERERS||{};
  global.DGL_MODULE_RENDERERS["campaign-studio"]=render;
  global.DGL_CAMPAIGN_STUDIO_V5={render,emailHtml,strategy};
})(window);
