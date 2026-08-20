
(function(global){
  "use strict";
  const esc=v=>String(v==null?"":v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
  const M=()=>global.DGL_MARKETING_CAMPAIGN_OS||{};
  const KEY="dgl_v5_area_requests";

  let selectedId=null;
  let filter="ALL";

  function audiences(){
    try{return M().buildAudiences?M().buildAudiences():[]}catch(_){return[]}
  }
  function aud(id){
    return audiences().find(x=>x.id===id)||{count:0,name:id};
  }
  function areaRequests(){
    try{return JSON.parse(localStorage.getItem(KEY)||"[]")}catch(_){return[]}
  }
  function saveRequests(rows){localStorage.setItem(KEY,JSON.stringify(rows))}

  function novaOpportunities(){
    const qCold=aud("AUD-QNBCOLD"), q15=aud("AUD-QNB30"), re60=aud("AUD-RE60"), risk=aud("AUD-RISK"), cross=aud("AUD-XSELL");
    return [
      {
        id:"OPP-QNB-DRAYAGE-30",sourceType:"NOVA",sourceLabel:"closingRate()",area:"Drayage",
        title:"QNB Drayage · 30+ días",need:"Cotizaciones sin booking/respuesta que requieren reapertura.",
        objective:"Quoted Not Booked",service:"Drayage",audienceId:"AUD-QNBCOLD",audienceCount:qCold.count,
        qnbWindow:"30+",priority:"high",validation:"Ready for Marketing",gate:"Validar owner, contacto válido y ausencia de gestión comercial activa.",
        expectedAction:"Nueva cotización / RFQ",lane:"",campaignName:"QNB Drayage · 30+ Days"
      },
      {
        id:"OPP-QNB-15",sourceType:"NOVA",sourceLabel:"closingRate()",area:"FTL/LTL/Drayage",
        title:"QNB · 15–30 días",need:"Evitar que cotizaciones abiertas continúen enfriándose.",
        objective:"Quoted Not Booked",service:"FTL",audienceId:"AUD-QNB30",audienceCount:q15.count,
        qnbWindow:"15-30",priority:"high",validation:"Ready for Marketing",gate:"Segmentar por servicio y confirmar que la cotización sigue abierta.",
        expectedAction:"Actualizar cotización",lane:"",campaignName:"QNB · 15-30 Days"
      },
      {
        id:"OPP-RE60",sourceType:"NOVA",sourceLabel:"reporteCuentas() + reporteMigracionTiers()",area:"AM",
        title:"Reactivation 60+",need:"Cuentas con señal de inactividad que pueden requerir reactivación.",
        objective:"Reactivation",service:"Multiservicio",audienceId:"AUD-RE60",audienceCount:re60.count,
        priority:"medium",validation:"AM Validation",gate:"AM debe confirmar owner, cobranza y que la cuenta no esté siendo gestionada activamente.",
        expectedAction:"Volver a cotizar",lane:"",campaignName:"Reactivation 60+"
      },
      {
        id:"OPP-RISK",sourceType:"NOVA",sourceLabel:"reporteMigracionTiers()",area:"AM",
        title:"Retention · Tier / Activity Drop",need:"Cuentas con caída de actividad o riesgo de salida del ciclo activo.",
        objective:"Retention",service:"Multiservicio",audienceId:"AUD-RISK",audienceCount:risk.count,
        priority:"high",validation:"AM Validation",gate:"AM valida si la caída refleja riesgo comercial real antes de activar Marketing.",
        expectedAction:"Retener / generar conversación",lane:"",campaignName:"Retention · At Risk"
      },
      {
        id:"OPP-XSELL",sourceType:"NOVA",sourceLabel:"Salesforce + validación de servicio",area:"FTL/LTL/Drayage",
        title:"Cross-Sell Eligible",need:"Cuentas que ya trabajan con DGL pero no utilizan un servicio relevante.",
        objective:"Cross-Sell",service:"Drayage",audienceId:"AUD-XSELL",audienceCount:cross.count,
        priority:"medium",validation:"Service Validation",gate:"El líder del servicio valida encaje, capacidad y propuesta comercial antes del lanzamiento.",
        expectedAction:"Abrir nuevo servicio",lane:"",campaignName:"Cross-Sell · Drayage"
      }
    ];
  }

  function requestToOpp(r){
    return {
      id:r.id,sourceType:"AREA",sourceLabel:"Area Request",area:r.area,title:r.title||`${r.area} · ${r.needType}`,
      need:r.notes||r.needType,objective:r.objective,service:r.service,audienceId:"",audienceCount:r.audienceCount||0,
      qnbWindow:r.qnbWindow||"",priority:(r.priority||"medium").toLowerCase(),validation:r.validation||"Needs NOVA Audience",
      gate:r.gate||"NOVA debe construir/validar audiencia antes de ejecución.",
      expectedAction:r.expectedAction||"Generate RFQ",lane:r.lane||"",campaignName:r.campaignName||`${r.area} · ${r.needType}`
    };
  }

  function allOpps(){return [...novaOpportunities(),...areaRequests().map(requestToOpp)]}
  function filtered(){
    const rows=allOpps();
    if(filter==="ALL") return rows;
    return rows.filter(x=>String(x.area).toUpperCase().includes(filter));
  }
  function selected(){
    const rows=allOpps();
    return rows.find(x=>x.id===selectedId)||rows[0]||null;
  }

  function kpis(){
    const n=novaOpportunities().length, a=areaRequests().length, rows=allOpps();
    const ready=rows.filter(x=>/Ready for Marketing/i.test(x.validation)).length;
    const val=rows.length-ready;
    return {n,a,ready,val};
  }

  function card(o){
    const stateClass=/Ready for Marketing/i.test(o.validation)?"ready":"";
    return `<div class="v5-opportunity ${esc(o.priority)} ${selectedId===o.id?"active":""}" data-opp-id="${esc(o.id)}">
      <div class="priority-bar"></div>
      <div>
        <div class="v5-opp-top">
          <span class="v5-source-pill">${o.sourceType==="NOVA"?"NOVA DETECTED":"AREA REQUESTED"}</span>
          <span class="v5-area-pill">${esc(o.area)}</span>
          <span class="v5-state-pill ${stateClass}">${esc(o.validation)}</span>
        </div>
        <div class="v5-opp-title">${esc(o.title)}</div>
        <div class="v5-opp-sub">${esc(o.need)}</div>
      </div>
      <div class="v5-opp-count"><strong>${Number(o.audienceCount||0)}</strong><span>audience</span></div>
    </div>`;
  }

  function detail(o){
    if(!o) return "";
    return `<div class="v5-detail-hero">
        <div class="mini">${o.sourceType==="NOVA"?"NOVA OPPORTUNITY":"AREA REQUEST"} · ${esc(o.area)}</div>
        <h3>${esc(o.title)}</h3>
        <p>${esc(o.need)}</p>
      </div>
      <div class="v5-detail-grid">
        <div class="v5-detail-item"><span>Recommended Campaign</span><strong>${esc(o.objective)}</strong></div>
        <div class="v5-detail-item"><span>Service</span><strong>${esc(o.service)}</strong></div>
        <div class="v5-detail-item"><span>Source</span><strong>${esc(o.sourceLabel)}</strong></div>
        <div class="v5-detail-item"><span>Expected Action</span><strong>${esc(o.expectedAction)}</strong></div>
        <div class="v5-detail-item"><span>Audience</span><strong>${Number(o.audienceCount||0)} records</strong></div>
        <div class="v5-detail-item"><span>Priority</span><strong>${esc(String(o.priority).toUpperCase())}</strong></div>
      </div>
      <div class="v5-gate"><strong>Validation Gate</strong><p>${esc(o.gate)}</p></div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="v5-btn primary" data-v5-build="${esc(o.id)}"><i data-lucide="wand-sparkles"></i>Build Campaign</button>
        <button class="v5-btn" data-v5-copy-brief="${esc(o.id)}"><i data-lucide="copy"></i>Copy Brief</button>
      </div>`;
  }

  function requestDrawer(){
    return `<div class="v5-request-drawer" id="v5RequestDrawer">
      <div class="v5-request-sheet">
        <div class="v5-kicker">Area → Marketing</div>
        <h2>New Campaign Request</h2>
        <p style="font-size:11px;line-height:1.55;color:#667085;margin:0 0 18px">El área indica la necesidad comercial. Marketing define campaña, mensaje, diseño, canal y secuencia. NOVA construirá/validará la audiencia.</p>
        <div class="v5-form-grid">
          <div class="v5-field"><label>Area</label><select id="reqArea" class="v5-input"><option>FTL</option><option>LTL</option><option>Drayage</option><option>AM</option></select></div>
          <div class="v5-field"><label>Need Type</label><select id="reqNeed" class="v5-input"><option>Capacity Opportunity</option><option>Lane Opportunity</option><option>Quote Recovery</option><option>Reactivation</option><option>Retention</option><option>Cross-Sell</option></select></div>
          <div class="v5-field"><label>Recommended Objective</label><select id="reqObjective" class="v5-input"><option>Service Campaign</option><option>Lane Campaign</option><option>Quoted Not Booked</option><option>Reactivation</option><option>Retention</option><option>Cross-Sell</option></select></div>
          <div class="v5-field"><label>Service</label><select id="reqService" class="v5-input"><option>FTL</option><option>LTL</option><option>Drayage</option><option>Cross Border</option><option>Multiservicio</option></select></div>
          <div class="v5-field full"><label>Lane / Port / Market</label><input id="reqLane" class="v5-input" placeholder="Ej. Houston Port / Dallas → Atlanta"></div>
          <div class="v5-field"><label>Validity</label><input id="reqValidity" class="v5-input" placeholder="Ej. próximos 30 días"></div>
          <div class="v5-field"><label>Priority</label><select id="reqPriority" class="v5-input"><option>High</option><option selected>Medium</option><option>Low</option></select></div>
          <div class="v5-field"><label>Expected Action</label><select id="reqExpected" class="v5-input"><option>Generate RFQ</option><option>Recover Quote</option><option>Reply</option><option>Meeting</option><option>Open New Service</option></select></div>
          <div class="v5-field"><label>Response Owner</label><input id="reqOwner" class="v5-input" placeholder="FTL / LTL / Drayage / AM"></div>
          <div class="v5-field full"><label>Commercial Context</label><textarea id="reqNotes" class="v5-input" placeholder="Qué está viendo el área y por qué Marketing debería activarlo."></textarea></div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">
          <button class="v5-btn" data-v5-close-request>Cancel</button>
          <button class="v5-btn primary" data-v5-save-request>Save Request</button>
        </div>
      </div>
    </div>`;
  }

  function render(container){
    const stats=kpis();
    const rows=filtered();
    if(!selectedId && rows[0]) selectedId=rows[0].id;
    container.innerHTML=`<div class="v5-workspace">
      <div class="v5-topbar">
        <div>
          <div class="v5-kicker">Demand Orchestration</div>
          <h1>Campaign Opportunity Center</h1>
          <p>FTL, LTL, Drayage y AM indican la necesidad comercial. NOVA convierte Salesforce en audiencias y señales. Marketing decide cómo activarlas.</p>
        </div>
        <div class="v5-top-actions">
          <span class="v5-badge">LOCAL / DEMO DATA</span>
          <button class="v5-btn navy" data-v5-new-request><i data-lucide="plus"></i>New Area Request</button>
        </div>
      </div>

      <div class="v5-grid-kpi">
        <div class="v5-kpi"><div class="label">NOVA Detected</div><div class="value">${stats.n}</div><div class="foot">Signals converted into opportunities</div></div>
        <div class="v5-kpi"><div class="label">Area Requests</div><div class="value">${stats.a}</div><div class="foot">FTL · LTL · Drayage · AM</div></div>
        <div class="v5-kpi"><div class="label">Ready for Marketing</div><div class="value">${stats.ready}</div><div class="foot">Can move to Campaign Studio</div></div>
        <div class="v5-kpi"><div class="label">Needs Validation</div><div class="value">${stats.val}</div><div class="foot">AM / Pricing / Service gate</div></div>
      </div>

      <div class="v5-panel v5-panel-pad">
        <div class="v5-panel-head">
          <div><h2>Opportunity Queue</h2><p>Una oportunidad no es todavía una campaña. Primero se valida señal, owner y vigencia comercial.</p></div>
          <div class="v5-filterbar">
            ${["ALL","FTL","LTL","DRAYAGE","AM"].map(x=>`<button class="v5-filter ${filter===x?"active":""}" data-v5-filter="${x}">${x}</button>`).join("")}
          </div>
        </div>
        <div class="v5-opportunity-layout">
          <div class="v5-opportunity-list" id="v5OppList">${rows.map(card).join("")}</div>
          <div id="v5OppDetail">${detail(selected())}</div>
        </div>
      </div>
      ${requestDrawer()}
    </div>`;
    if(global.lucide) global.lucide.createIcons();
  }

  function briefText(o){
    return [
      `Source: ${o.sourceType} · ${o.sourceLabel}`,
      `Area: ${o.area}`,
      `Need: ${o.need}`,
      `Recommended campaign: ${o.objective}`,
      `Service: ${o.service}`,
      `Audience: ${o.audienceCount||0}`,
      `Validation: ${o.validation}`,
      `Expected action: ${o.expectedAction}`,
      o.lane?`Lane/Port: ${o.lane}`:"",
      `Gate: ${o.gate}`
    ].filter(Boolean).join("\n");
  }

  function buildCampaign(o){
    const context={
      sourceType:o.sourceType,sourceLabel:o.sourceLabel,opportunityId:o.id,area:o.area,
      objective:o.objective,service:o.service,audienceId:o.audienceId||"",audienceCount:o.audienceCount||0,
      qnbWindow:o.qnbWindow||"",campaignName:o.campaignName||o.title,lane:o.lane||"",
      expectedAction:o.expectedAction,validation:o.validation,gate:o.gate,need:o.need
    };
    sessionStorage.setItem("dgl_v5_campaign_context",JSON.stringify(context));
    window.location.hash="#/campaign-studio";
  }

  document.addEventListener("click",e=>{
    const item=e.target.closest("[data-opp-id]");
    if(item){
      selectedId=item.dataset.oppId;
      document.querySelectorAll(".v5-opportunity").forEach(x=>x.classList.toggle("active",x.dataset.oppId===selectedId));
      const mount=document.getElementById("v5OppDetail");
      if(mount){mount.innerHTML=detail(selected());if(global.lucide)global.lucide.createIcons()}
      return;
    }
    const f=e.target.closest("[data-v5-filter]");
    if(f){
      filter=f.dataset.v5Filter;
      const main=document.getElementById("mainContent"); if(main) render(main);
      return;
    }
    if(e.target.closest("[data-v5-new-request]")){
      const d=document.getElementById("v5RequestDrawer"); if(d)d.classList.add("open"); return;
    }
    if(e.target.closest("[data-v5-close-request]")){
      const d=document.getElementById("v5RequestDrawer"); if(d)d.classList.remove("open"); return;
    }
    if(e.target.closest("[data-v5-save-request]")){
      const id="REQ-"+Date.now().toString(36).toUpperCase();
      const r={
        id,sourceType:"AREA",area:document.getElementById("reqArea").value,
        needType:document.getElementById("reqNeed").value,objective:document.getElementById("reqObjective").value,
        service:document.getElementById("reqService").value,lane:document.getElementById("reqLane").value.trim(),
        validity:document.getElementById("reqValidity").value.trim(),priority:document.getElementById("reqPriority").value,
        expectedAction:document.getElementById("reqExpected").value,owner:document.getElementById("reqOwner").value.trim(),
        notes:document.getElementById("reqNotes").value.trim(),validation:"Needs NOVA Audience",audienceCount:0,
        title:`${document.getElementById("reqArea").value} · ${document.getElementById("reqNeed").value}`,
        gate:"NOVA debe construir la audiencia y el área debe confirmar vigencia/capacidad antes del lanzamiento."
      };
      const rows=areaRequests();rows.unshift(r);saveRequests(rows);selectedId=id;
      const main=document.getElementById("mainContent"); if(main) render(main);
      return;
    }
    const b=e.target.closest("[data-v5-build]");
    if(b){const o=allOpps().find(x=>x.id===b.dataset.v5Build);if(o)buildCampaign(o);return}
    const c=e.target.closest("[data-v5-copy-brief]");
    if(c){
      const o=allOpps().find(x=>x.id===c.dataset.v5CopyBrief);
      if(o && navigator.clipboard) navigator.clipboard.writeText(briefText(o));
      if(global.DGL_INTERACTIONS&&global.DGL_INTERACTIONS.toast) global.DGL_INTERACTIONS.toast("Campaign brief copied.");
    }
  });

  global.DGL_MODULE_RENDERERS=global.DGL_MODULE_RENDERERS||{};
  global.DGL_MODULE_RENDERERS["campaign-opportunities"]=render;
  global.DGL_CAMPAIGN_OPPORTUNITY_CENTER_V5={render};
})(window);
