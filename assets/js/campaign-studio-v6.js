(function(g){
"use strict";
const KEY="dgl_v5_campaign_context";
const LOGO="https://dglmarketing2026.github.io/dgl-marketing-execution-os/assets/brand/dgl-logo-white.png";
const LANGUAGES=["ES","EN","PT"],FIELDS=["subjectA","subjectB","preheader","headline","body","body2","cta"];
const E=v=>String(v==null?"":v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const api=()=>g.DGL_MARKETING_BACKEND_ADAPTER_V55;
const Lib=()=>g.DGL_CREATIVE_LIBRARY_V5,Render=()=>g.DGL_CREATIVE_RENDER_V5;
// AURA intake: the ONLY campaign-level question Marketing answers. Everything else (per-contact
// language, premium visual system, family copy and CTA) is resolved automatically from it.
const INTAKE_QUESTION="WHAT TYPE OF CAMPAIGN IS THIS?",INTAKE_OPTIONS=["ACTIVATION","RETENTION","REACTIVATION","QUOTED_NOT_BOOKED","CROSS_SELL"];
const INTAKE_BY_OBJECTIVE={"Activation":"ACTIVATION","Retention":"RETENTION","Reactivation":"REACTIVATION","Quoted Not Booked":"QUOTED_NOT_BOOKED","Cross-Sell":"CROSS_SELL"};
function objectiveOf(context){return Lib().normalizeObjective(context.objective||context.campaignType);}
function selectionFor(context){return Render().selection({objective:objectiveOf(context),service:context.service,angle:context.messageAngle});}
function autoSystem(context){return selectionFor(context).systemId;}
function validSystem(id){return !!(id&&Lib().CREATIVE_SYSTEMS[id]);}
let model=null,mount=null,epoch=0,inFlight=0;
function navigationId(){
  const q=new URLSearchParams((g.location.hash||"").split("?")[1]||"");
  if(q.has("campaignId"))return q.get("campaignId")||"";
  return "";
}
function createModel(context){
  const m={context:Object.freeze({...context}),language:(context.requiredLanguages||[])[0]||"ES",layout:autoSystem(context),selection:selectionFor(context),variants:{},brand:null,busy:false,error:"",pendingRevokes:new Set()};
  LANGUAGES.forEach(language=>{
    const approved=context.approvedCreativeVariants?.[language];
    m.variants[language]={copy:g.DGL_COPY_ENGINE_V5.generate({objective:objectiveOf(context),service:context.service,angle:context.messageAngle,language,qnbWindow:context.qnbWindow,ctaIntent:g.DGL_CREATIVE_LIBRARY_V5?.OBJECTIVES?.[objectiveOf(context)]?.defaultCta}),dirty:!approved,testDraftStatus:context.testDraftStatus?.[language]||(approved?"APPROVED / TEST DRAFT REQUIRED":"UNAPPROVED"),approved:!!approved,...(approved||{})};
  });return m;
}
function selectLanguage(m,language){if(!LANGUAGES.includes(language))throw Error("Unsupported language");m.language=language;}
async function revoke(m,languages){
  const ids=[];
  // Resolve latest backend approvals too: another tab may have approved since this view loaded.

  languages.forEach(l=>{
    const v=m.variants[l];if(v.creativeId)m.pendingRevokes.add(v.creativeId);
    v.dirty=true;v.approved=false;v.storedHtml=null;v.storedText=null;
    if(v.testDraftStatus==="CREATED"||v.testDraftStatus==="TEST DRAFT VERIFIED")v.testDraftStatus="STALE AFTER EDIT";
    ["creativeId","creativeVersion","approvalId","htmlChecksum","contentChecksum"].forEach(k=>delete v[k]);
  });
  m.context=Object.freeze({...m.context,creativeSetStatus:"PENDING",approvalStatus:"PENDING"});
  if(api().campaignStudioContext){const current=await api().campaignStudioContext(m.context.campaignId);languages.forEach(l=>{const id=current.approvedCreativeVariants?.[l]?.creativeId;if(id)m.pendingRevokes.add(id);});}
  for(const id of m.pendingRevokes)ids.push(id);
  for(const id of ids){await api().revokeApprovedCreative(id,"Marketing");m.pendingRevokes.delete(id);}
}
async function editCopy(m,field,value){if(!FIELDS.includes(field))return;const language=m.language,v0=m.variants[language];v0.copy[field]=value;if(v0.dirty&&!v0.approved&&!v0.creativeId&&!m.pendingRevokes.size)return;const pending=revoke(m,[language]),current=Promise.all([m.revoking?m.revoking.catch(()=>{}):Promise.resolve(),pending]);m.revoking=current;try{await current;}finally{if(m.revoking===current)m.revoking=null;}}
async function changeLayout(m,value){if(!validSystem(value))throw Error("Unknown DGL visual system");m.layout=value;await revoke(m,LANGUAGES);}
const CTA_SUBJECT={ES:"Requerimiento terrestre",PT:"Requerimento terrestre",EN:"Ground freight requirement"};
// ONE governed renderer: the existing premium DGL visual systems (creative-render-v5.js), with the
// visual system auto-selected from the campaign family. Tokens stay unmerged so the approved HTML
// is exactly what AURA later token-merges per recipient -- never redesigned downstream.
function emailHtml(m,language=m.language){
  const v=m.variants[language];if(v.storedHtml&&!v.dirty)return v.storedHtml;
  const c=m.context,objective=objectiveOf(c),service=Lib().SERVICES[c.service]||Lib().SERVICES.Multiservicio;
  const strategy={creativeSystem:m.layout,objective,service:c.service,angle:c.messageAngle,lane:c.lane||"",heroUrl:"",logoUrl:LOGO,serviceDisplay:objective==="Activation"?service.descriptor:undefined};
  return Render().render(strategy,v.copy,{ctaSubject:CTA_SUBJECT[language]});
}
function validateBrand(){
  return new Promise((resolve,reject)=>{
    const img=new Image(),timer=setTimeout(()=>reject(Error("Logo load timed out")),15000);
    img.onload=()=>{clearTimeout(timer);if(img.src!==LOGO||!img.complete||img.naturalWidth<=0)return reject(Error("Canonical logo failed validation"));resolve({url:img.src,naturalWidth:img.naturalWidth});};
    img.onerror=()=>{clearTimeout(timer);reject(Error("Canonical logo did not load"));};img.src=LOGO;
  });
}
function payload(m){
  const v=m.variants[m.language],c=v.copy;
  return {creativeId:v.creativeId,creativeVersion:v.creativeVersion,approvalId:v.approvalId,contentChecksum:v.contentChecksum,htmlChecksum:v.htmlChecksum,language:m.language,subject:c.subjectA,preheader:c.preheader,htmlBody:emailHtml(m),textBody:!v.dirty&&v.storedText!=null?v.storedText:[c.headline,c.body,c.body2,c.cta].join("\n\n"),templateId:m.layout,logoUrl:LOGO,heroUrl:"",approvedBy:"Marketing",creativeCopy:c,brandValidation:m.brand};
}
async function run(action){
  const m=model;if(!m||m.busy)return;m.busy=true;m.error="";draw();
  try{
    await (m.revoking||Promise.resolve());
    for(const id of [...m.pendingRevokes]){await api().revokeApprovedCreative(id,"Marketing");m.pendingRevokes.delete(id);}
    m.brand=await validateBrand();
    const c=await api().campaignStudioContext(m.context.campaignId);
    if(!c.audienceResolved)throw Error("Audience unresolved: approval and test drafts blocked.");
    m.context=Object.freeze({...c});
    if(action==="variant"){
      const record=await api().approveCreative(c.campaignId,payload(m));
      if(!record?.creativeId||!record.approvalId||!record.contentChecksum||!record.htmlChecksum||!(record.creativeVersion>0))throw Error("Incomplete approval record");
      Object.assign(m.variants[m.language],record,{approved:true,dirty:false,testDraftStatus:"APPROVED / TEST DRAFT REQUIRED"});
      m.context=Object.freeze(await api().campaignStudioContext(c.campaignId));
    }else if(action==="set"){
      m.context=Object.freeze(await api().approveCreativeSet(c.campaignId));
    }else if(action==="draft"){
      await api().campaignStudioTestDraft(c.campaignId,payload(m));
      m.context=Object.freeze(await api().campaignStudioContext(c.campaignId));
      const v=m.variants[m.language],e=m.context.testDraftVerifications?.[m.language];
      if(!e||e.creativeId!==v.creativeId||String(e.creativeVersion)!==String(v.creativeVersion)||String(e.contentChecksum)!==String(v.contentChecksum))throw Error("Test draft verification is missing or stale.");
      v.testDraftStatus="TEST DRAFT VERIFIED";
    }
  }catch(e){m.error=e.message||String(e);}finally{m.busy=false;if(model===m)draw();}
}
function variantStatus(v){if(v.legacyTemplate&&!v.approved)return "LEGACY DESIGN · NEW PREMIUM PREVIEW";return v.testDraftStatus==="STALE AFTER EDIT"?"STALE AFTER EDIT":!v.approved?"UNAPPROVED":v.testDraftStatus==="TEST DRAFT VERIFIED"?"TEST DRAFT VERIFIED":"APPROVED / TEST DRAFT REQUIRED";}
function canApproveSet(m){
  const c=m.context;return c.audienceResolved&&c.requiredLanguages?.length>0&&c.requiredLanguages.every(l=>{
    const v=m.variants[l],e=c.testDraftVerifications?.[l];
    return v.approved&&!v.dirty&&(!c.testDraftReviewRequired||(v.testDraftStatus==="TEST DRAFT VERIFIED"&&e&&e.creativeId===v.creativeId&&String(e.creativeVersion)===String(v.creativeVersion)&&String(e.contentChecksum)===String(v.contentChecksum)));
  });
}
// Approval actions always act on the committed system (m.layout). While Marketing is only
// inspecting another system in the gallery, they stay disabled so the approved HTML is always
// exactly the HTML in the preview.
function actionDisabled(m,a){return m.busy||!m.context.audienceResolved||(m.inspect&&m.inspect!==m.layout)||(a==="set"&&!canApproveSet(m))||(a==="draft"&&(!m.variants[m.language].approved||m.variants[m.language].dirty));}
// The preview is ALWAYS the renderer's real HTML: the governed emailHtml() for the committed
// system, or the same renderer for a system being inspected (never approved from there).
function previewHtml(m,language=m.language){
  if(!m.inspect||m.inspect===m.layout)return emailHtml(m,language);
  return emailHtml({...m,layout:m.inspect,variants:{...m.variants,[language]:{...m.variants[language],storedHtml:null,dirty:true}}},language);
}
// Personalized preview (display only). {{firstName}}/{{company}} are filled ONLY from a contact
// record supplied with the campaign context (context.previewRecipient); a token without verified
// data is shown as a marked placeholder, never an invented value. previewHtml()/emailHtml()/
// payload() keep the tokens unmerged: that is what is approved and what AURA merges at send time.
const TOKEN_LABEL={firstName:"Nombre",company:"Empresa"};
function previewRecipient(m){const r=m.context.previewRecipient;return r&&(r.firstName||r.company)?r:null;}
function personalizePreview(html,recipient){
  const r=recipient||{};let raw=false;
  return String(html||"").split(/(<[^>]*>)/).map(part=>{
    if(part.charAt(0)==="<"){const t=/^<\s*(\/)?\s*(title|style|script)\b/i.exec(part);if(t)raw=!t[1];return part.replace(/\{\{(firstName|company)\}\}/g,(x,k)=>r[k]?E(r[k]):"["+TOKEN_LABEL[k]+"]");}
    return part.replace(/\{\{(firstName|company)\}\}/g,(x,k)=>r[k]?E(r[k]):raw?"["+TOKEN_LABEL[k]+"]":'<mark style="background:#FFF1BF;color:#5A4300;border-radius:3px;padding:0 3px">['+TOKEN_LABEL[k]+']</mark>');
  }).join("");
}
// Plain-language meaning of the governance states; the state codes and their gates are unchanged.
const VARIANT_LABEL={"UNAPPROVED":"Sin aprobar","STALE AFTER EDIT":"Editada después de aprobar","APPROVED / TEST DRAFT REQUIRED":"Aprobada","TEST DRAFT VERIFIED":"Aprobada y verificada","LEGACY DESIGN · NEW PREMIUM PREVIEW":"Diseño anterior"};
const SET_LABEL={PENDING:"Pendiente",CREATIVE_SET_INCOMPLETE:"Incompleto",TEST_DRAFT_SET_INCOMPLETE:"Falta borrador de prueba",READY_FOR_APPROVAL:"Listo para aprobar",APPROVED:"Aprobado",AUDIENCE_UNRESOLVED:"Audiencia sin resolver"};
function variantHelp(m,language=m.language){
  const c=m.context,s=variantStatus(m.variants[language]);
  return s==="UNAPPROVED"?"Nadie ha aprobado todavía la variante "+language+". Revisa la vista previa y pulsa «Aprobar variante».":
    s==="STALE AFTER EDIT"?"La variante "+language+" se editó después de aprobarla: la aprobación anterior se revocó. Apruébala de nuevo.":
    s==="APPROVED / TEST DRAFT REQUIRED"?"Variante "+language+" aprobada. Crea un borrador de prueba (no se envía) para revisarla en Gmail"+(c.testDraftReviewRequired?"; es obligatorio para aprobar el set.":"."):
    s==="TEST DRAFT VERIFIED"?"Variante "+language+" aprobada y con borrador de prueba verificado.":
    "La variante "+language+" usa un diseño retirado. Aprobar la nueva vista previa crea una versión nueva; nada se revoca.";
}
function setHelp(m){
  const c=m.context,code=String(c.creativeSetStatus||"PENDING").toUpperCase(),langs=c.requiredLanguages||[],missing=langs.filter(l=>!m.variants[l]?.approved);
  if(code==="APPROVED")return "El set creativo está aprobado: AURA puede usarlo. Sigue requiriendo tu aprobación en AURA antes de cualquier envío.";
  if(code==="AUDIENCE_UNRESOLVED")return "La audiencia no está resuelta: las aprobaciones y los borradores de prueba están bloqueados.";
  return "El set creativo aún no está aprobado. Se aprueba cuando cada idioma requerido ("+(langs.join(" / ")||"—")+") tiene su variante aprobada"+(c.testDraftReviewRequired?" y un borrador de prueba verificado":"")+(missing.length?". Falta: "+missing.join(" / ")+".":". Pulsa «Aprobar set creativo».");
}
function statusHelp(m){return setHelp(m)+" "+variantHelp(m)+" Las aprobaciones se guardan en el backend privado; nada se aprueba automáticamente.";}
// Connection/back-end errors explained without changing them: the original message stays visible.
function friendlyError(msg){
  const s=String(msg||"");if(!s)return "";
  const why=/AUTHENTICATION FAILED|unauthoriz|forbidden|invalid token|token required/i.test(s)?"No hay conexión válida con el backend privado: el token falta o fue rechazado. Vuelve a conectar con «Conectar datos».":
    /Connect the private backend/i.test(s)?"Campaign Studio necesita el backend privado. Pulsa «Conectar datos».":
    /timed out|timeout|tiempo/i.test(s)?"El backend privado no respondió a tiempo. Inténtalo de nuevo en unos minutos.":
    /^QA \(datos de prueba\)/.test(s)?"":"La acción no se completó.";
  return why?why+" Detalle: "+s:s;
}
function actionHint(m){
  const c=m.context,v=m.variants[m.language];
  if(!c.audienceResolved)return "Bloqueado: la audiencia no está resuelta.";
  if(m.inspect&&m.inspect!==m.layout)return "Estás comparando otro diseño: vuelve al diseño elegido o pulsa «Usar este diseño» para aprobar.";
  if(!v.approved||v.dirty)return "Primero aprueba la variante "+m.language+"; después podrás crear su borrador de prueba.";
  if(!canApproveSet(m)){const missing=(c.requiredLanguages||[]).filter(l=>!m.variants[l]?.approved);return missing.length?"Para aprobar el set falta aprobar: "+missing.join(" / ")+".":"Para aprobar el set falta el borrador de prueba verificado.";}
  return "Todo listo para aprobar el set creativo.";
}

// ---------- Layout / styles (scoped, injected once) ----------
const CSS=`.cs6{--cs6-gap:20px;color:var(--text,#fff)}.cs6 *{box-sizing:border-box}
.cs6-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:18px}
.cs6-head h2{margin:4px 0 0;font-size:22px;line-height:1.2}.cs6-eyebrow{font-size:11px;letter-spacing:1.6px;font-weight:800;color:var(--secondary,#77B82A)}
.cs6-muted{color:var(--text-secondary,#AAB3C5);font-size:13px}
.cs6-panel{background:var(--card,#1A2236);border:1px solid var(--border,rgba(255,255,255,.08));border-radius:12px;padding:16px}
.cs6-filters{display:grid;grid-template-columns:2fr repeat(4,1fr);gap:10px;margin-bottom:12px}
.cs6-filters input,.cs6-filters select,.cs6-field textarea{width:100%;min-width:0;background:rgba(255,255,255,.04);color:inherit;border:1px solid var(--border-strong,rgba(255,255,255,.14));border-radius:8px;padding:10px 12px;font:inherit;font-size:13px}
.cs6-filters select option{color:#111}
.cs6-list{list-style:none;margin:0;padding:0;max-height:62vh;overflow:auto;border-top:1px solid var(--border,rgba(255,255,255,.08))}
.cs6-row{display:grid;grid-template-columns:minmax(0,2.4fr) repeat(4,minmax(0,1fr));gap:10px;align-items:center;width:100%;padding:11px 10px;border:0;border-bottom:1px solid var(--border,rgba(255,255,255,.08));background:none;color:inherit;text-align:left;font:inherit;font-size:13px;cursor:pointer}
.cs6-row:hover,.cs6-row:focus-visible{background:rgba(119,184,42,.08);outline:none}.cs6-row.is-active{background:rgba(119,184,42,.14)}
.cs6-row strong{font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cs6-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-secondary,#AAB3C5)}
.cs6-rowhead{cursor:default;font-size:11px;letter-spacing:1px;font-weight:800;color:var(--muted,#6B7280);text-transform:uppercase}.cs6-rowhead:hover{background:none}
.cs6-count{font-size:12px;color:var(--text-secondary,#AAB3C5);margin:0 0 8px}
.cs6-ws{display:grid;grid-template-columns:minmax(0,1fr) 736px;gap:var(--cs6-gap);align-items:start}
.cs6-col{display:grid;gap:16px;min-width:0}
.cs6-kv{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0}.cs6-kv div{min-width:0}.cs6-kv dt{font-size:10.5px;letter-spacing:1px;font-weight:800;color:var(--muted,#6B7280);text-transform:uppercase}.cs6-kv dd{margin:4px 0 0;font-size:13.5px;font-weight:700;overflow-wrap:anywhere}
.cs6-tabs{display:flex;gap:8px;flex-wrap:wrap}
.cs6-tab{flex:1 1 0;min-width:0;padding:9px 10px;border-radius:8px;border:1px solid var(--border-strong,rgba(255,255,255,.14));background:rgba(255,255,255,.03);color:inherit;font:inherit;font-size:12px;cursor:pointer;text-align:left}
.cs6-tab b{display:block;font-size:13px}.cs6-tab small{display:block;color:var(--text-secondary,#AAB3C5);font-size:10.5px;white-space:normal}
.cs6-tab[aria-selected="true"],.cs6-sys[aria-pressed="true"]{border-color:var(--secondary,#77B82A);background:rgba(119,184,42,.14)}
.cs6-systems{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.cs6-sys{padding:10px;border-radius:8px;border:1px solid var(--border-strong,rgba(255,255,255,.14));background:rgba(255,255,255,.03);color:inherit;font:inherit;font-size:12px;text-align:left;cursor:pointer;min-width:0}
.cs6-sys b{display:block;font-size:12.5px}.cs6-sys small{display:block;color:var(--text-secondary,#AAB3C5);font-size:10.5px}
.cs6-badge{display:inline-block;padding:2px 7px;border-radius:99px;background:var(--secondary,#77B82A);color:#06210a;font-size:9.5px;font-weight:900;letter-spacing:.6px;margin-left:4px;vertical-align:middle}
.cs6-why{margin:10px 0 0;font-size:12.5px;line-height:1.5;color:var(--text-secondary,#AAB3C5)}.cs6-why strong{color:var(--text,#fff)}
.cs6-inspect{margin-top:10px;padding:10px 12px;border:1px dashed var(--warning,#F59E0B);border-radius:8px;font-size:12.5px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
.cs6-field{display:block;margin-bottom:10px;font-size:11px;letter-spacing:.8px;font-weight:800;color:var(--muted,#6B7280);text-transform:uppercase}.cs6-field textarea{display:block;margin-top:5px;min-height:46px;resize:vertical;text-transform:none;letter-spacing:0;font-weight:400;color:var(--text,#fff)}
.cs6-actions{display:flex;gap:8px;flex-wrap:wrap}.cs6-actions .btn{flex:1 1 auto}
.cs6-gov{display:grid;gap:6px;font-size:12.5px}.cs6-gov div{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid var(--border,rgba(255,255,255,.08));padding-bottom:6px}.cs6-gov span:last-child{font-weight:700;text-align:right}
.cs6-previewcol{position:sticky;top:12px}
.cs6-previewbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:10px}
.cs6-device{display:flex;gap:6px}.cs6-device button{padding:6px 10px;border-radius:6px;border:1px solid var(--border-strong,rgba(255,255,255,.14));background:none;color:inherit;font:inherit;font-size:11.5px;cursor:pointer}.cs6-device button[aria-pressed="true"]{border-color:var(--secondary,#77B82A);color:var(--secondary,#77B82A)}
.cs6-frame{display:block;margin:0 auto;width:100%;max-width:704px;height:1180px;border:0;border-radius:10px;background:#F3F5F7}.cs6-frame.is-mobile{max-width:390px;height:1460px}
.cs6-alert{color:var(--danger,#EF4444);font-size:13px;min-height:1px;margin:0}
.cs6-back{white-space:nowrap}
.cs6-steps{display:flex;flex-wrap:wrap;gap:8px;list-style:none;margin:0 0 18px;padding:0}
.cs6-step{display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:99px;border:1px solid var(--border-strong,rgba(255,255,255,.14));font-size:13px;font-weight:700;color:var(--text-secondary,#AAB3C5)}
.cs6-step.is-done{border-color:var(--secondary,#77B82A);color:var(--text,#fff)}.cs6-step.is-current{background:rgba(119,184,42,.14);border-color:var(--secondary,#77B82A);color:var(--text,#fff)}.cs6-step.is-blocked{border-color:var(--danger,#EF4444);color:var(--text,#fff)}
.cs6-num{display:inline-grid;place-items:center;flex:none;width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,.08);font-size:12px;font-weight:900}.cs6-step.is-done .cs6-num,.cs6-step.is-current .cs6-num,.cs6-stephead .cs6-num{background:var(--secondary,#77B82A);color:#06210a}
.cs6-stephead{display:flex;gap:12px;align-items:flex-start;margin-bottom:14px}.cs6-stephead h3{margin:0;font-size:17px;line-height:1.3}.cs6-stephead p{margin:3px 0 0;line-height:1.45}.cs6-stephead .cs6-num{width:28px;height:28px;font-size:13px}
.cs6-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.cs6-facts div{background:rgba(255,255,255,.03);border-radius:8px;padding:10px 12px;min-width:0}.cs6-facts b{display:block;font-size:18px;overflow-wrap:anywhere}.cs6-facts span{font-size:12px;color:var(--text-secondary,#AAB3C5)}
.cs6-sub{margin:16px 0 8px;font-size:11px;letter-spacing:1px;font-weight:800;color:var(--muted,#6B7280);text-transform:uppercase}
.cs6-edit{margin-top:14px;border-top:1px solid var(--border,rgba(255,255,255,.08));padding-top:12px}.cs6-edit summary,.cs6-tech summary{cursor:pointer;font-weight:800;font-size:13.5px}
.cs6-tech summary{color:var(--text-secondary,#AAB3C5)}.cs6-tech[open] summary{margin-bottom:12px}
.cs6-gov .cs6-state{display:block;border-bottom:1px solid var(--border,rgba(255,255,255,.08));padding:0 0 10px}.cs6-state>div{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}.cs6-state b{font-size:14px}.cs6-state code{font-size:10.5px;font-weight:700;padding:1px 6px;border-radius:4px;background:rgba(255,255,255,.08);color:var(--text-secondary,#AAB3C5)}.cs6-state p{margin:6px 0 0;font-size:13px;line-height:1.5;color:var(--text-secondary,#AAB3C5)}
.cs6-gov{gap:12px;margin-bottom:12px}.cs6-hint{margin:10px 0 0;font-size:12.5px}.cs6-alert:empty{display:none}.cs6-alert{margin:0 0 10px;line-height:1.45}
.cs6-person{margin:0 0 10px;font-size:13px;line-height:1.5}.cs6-person mark{background:#FFF1BF;color:#5A4300;border-radius:3px;padding:0 3px}
.cs6-previewbar .cs6-stephead{margin-bottom:0}
@media (max-width:1359px){.cs6-ws{grid-template-columns:minmax(0,1fr)}.cs6-col{display:contents}[data-step="audience"]{order:1}[data-step="design"]{order:2}[data-step="preview"]{order:3}[data-step="approval"]{order:4}.cs6-tech{order:5}}
@media (max-width:760px){.cs6-filters{grid-template-columns:1fr 1fr}.cs6-filters input{grid-column:1/-1}.cs6-row{grid-template-columns:minmax(0,1fr) auto;gap:4px 10px}.cs6-row span{font-size:12px}.cs6-row .cs6-hide-m,.cs6-rowhead{display:none}.cs6-kv{grid-template-columns:1fr 1fr}.cs6-facts{grid-template-columns:1fr 1fr}.cs6-steps{gap:6px}.cs6-step{padding:6px 10px;font-size:12px}.cs6-systems{grid-template-columns:1fr 1fr}.cs6-frame{height:1500px}.cs6-head h2{font-size:19px}}`;
function ensureStyles(){
  const d=g.document;if(!d||!d.head||d.getElementById("cs6-styles"))return;
  const s=d.createElement("style");s.id="cs6-styles";s.textContent=CSS;d.head.appendChild(s);
}

// ---------- Session caches (performance) ----------
// The campaign list is loaded once per session; each campaign context once per module visit.
// Approvals/test drafts always re-fetch the authoritative context inside run().
const cache={list:null,listPromise:null,contexts:new Map()};
const LIST_KEY="dgl_cs6_campaign_list_v1";
function readListCache(){try{const raw=g.sessionStorage?.getItem(LIST_KEY);return raw?JSON.parse(raw):null;}catch(_){return null;}}
function writeListCache(list){try{g.sessionStorage?.setItem(LIST_KEY,JSON.stringify(list));}catch(_){}}
function normalizeCampaign(c){
  const objective=Lib().normalizeObjective(c.objective||c.campaignType||"")||"";
  return {campaignId:String(c.campaignId||""),campaignName:String(c.campaignName||c.campaignId||""),objective:String(objective||""),service:String(c.service||""),owner:String(c.amOwner||c.owner||c.accountManager||""),status:String(c.status||"")};
}
async function loadCampaignList(force){
  if(!force&&cache.list)return cache.list;
  if(!force){const stored=readListCache();if(stored){cache.list=stored;return stored;}}
  if(!cache.listPromise)cache.listPromise=api().campaignStudioList().then(r=>{const list=(r.campaigns||[]).map(normalizeCampaign).filter(c=>c.campaignId);cache.list=list;writeListCache(list);return list;}).finally(()=>{cache.listPromise=null;});
  return cache.listPromise;
}
const view={q:"",objective:"",service:"",owner:"",status:"",device:"desktop",techOpen:false,editOpen:false};
function uniq(list,k){return [...new Set(list.map(c=>c[k]).filter(Boolean))].sort((a,b)=>a.localeCompare(b));}
function filterCampaigns(list,f=view){
  const q=String(f.q||"").trim().toLowerCase();
  return list.filter(c=>(!q||[c.campaignName,c.campaignId,c.objective,c.service,c.owner].join(" ").toLowerCase().includes(q))&&(!f.objective||c.objective===f.objective)&&(!f.service||c.service===f.service)&&(!f.owner||c.owner===f.owner)&&(!f.status||c.status===f.status));
}
function selectorHtml(list,activeId){
  const opt=(k,label)=>'<select data-filter="'+k+'" aria-label="'+label+'"><option value="">'+label+': todos</option>'+uniq(list,k).map(v=>'<option'+(view[k]===v?' selected':'')+'>'+E(v)+'</option>').join("")+'</select>';
  return '<section class="cs6-panel" data-selector><div class="cs6-filters"><input type="search" data-search placeholder="Buscar por nombre, ID, objetivo, servicio o responsable" aria-label="Buscar campañas" value="'+E(view.q)+'">'+opt("objective","Objetivo")+opt("service","Servicio")+opt("owner","Responsable")+opt("status","Estado")+'</div>'+
    '<p class="cs6-count" data-count></p><ul class="cs6-list" role="listbox" aria-label="Campañas" data-list>'+listRowsHtml(list,activeId)+'</ul></section>';
}
function listRowsHtml(list,activeId){
  const rows=filterCampaigns(list);
  return '<li><div class="cs6-row cs6-rowhead"><span>Campaña</span><span>Objetivo</span><span class="cs6-hide-m">Servicio</span><span class="cs6-hide-m">Responsable</span><span class="cs6-hide-m">Estado</span></div></li>'+
    (rows.length?rows.map(c=>'<li><button type="button" role="option" class="cs6-row'+(c.campaignId===activeId?' is-active':'')+'" data-campaign="'+E(c.campaignId)+'" aria-selected="'+(c.campaignId===activeId)+'"><strong title="'+E(c.campaignName)+'">'+E(c.campaignName)+'</strong><span>'+E(c.objective||"—")+'</span><span class="cs6-hide-m">'+E(c.service||"—")+'</span><span class="cs6-hide-m">'+E(c.owner||"—")+'</span><span class="cs6-hide-m">'+E(c.status||"—")+'</span></button></li>').join(""):'<li class="cs6-muted" style="padding:14px 10px">Ninguna campaña coincide con estos filtros.</li>');
}
function bindSelector(root,list,activeId){
  const listEl=root.querySelector("[data-list]"),count=root.querySelector("[data-count]");
  const refresh=()=>{if(listEl)listEl.innerHTML=listRowsHtml(list,activeId);if(count)count.textContent=filterCampaigns(list).length+" de "+list.length+" campañas";bindRows();};
  const bindRows=()=>root.querySelectorAll("[data-campaign]").forEach(b=>b.onclick=()=>openCampaign(b.dataset.campaign));
  const search=root.querySelector("[data-search]");if(search)search.oninput=()=>{view.q=search.value;refresh();};
  root.querySelectorAll("[data-filter]").forEach(s=>s.onchange=()=>{view[s.dataset.filter]=s.value;refresh();});
  refresh();
}
function openCampaign(id){
  // In-place navigation: update the URL without triggering the app router's full module reload.
  const hash="#/campaign-studio?campaignId="+encodeURIComponent(id);
  try{g.history?.replaceState?g.history.replaceState(null,"",hash):(g.location.hash=hash);}catch(_){g.location.hash=hash;}
  return render(mount,id);
}
function backToList(){
  try{g.history?.replaceState?g.history.replaceState(null,"","#/campaign-studio"):(g.location.hash="#/campaign-studio");}catch(_){}
  return render(mount,"");
}

// ---------- Workspace ----------
const FIELD_LABEL={subjectA:"Asunto A",subjectB:"Asunto B",preheader:"Preencabezado",headline:"Titular",body:"Texto principal",body2:"Texto secundario",cta:"Botón"};
const STEPS=["Audiencia","Diseño","Vista previa","Aprobación"];
function stepState(m,i){
  const c=m.context,setOk=String(c.creativeSetStatus||"").toUpperCase()==="APPROVED";
  if(i===0)return c.audienceResolved?"done":"blocked";
  if(i===1||i===2)return c.audienceResolved?"done":"todo";
  return setOk?"done":c.audienceResolved?"current":"todo";
}
function stepperHtml(m){
  return '<ol class="cs6-steps" aria-label="Flujo de la campaña">'+STEPS.map((s,i)=>'<li class="cs6-step is-'+stepState(m,i)+'"><span class="cs6-num">'+(i+1)+'</span>'+E(s)+'</li>').join("")+'</ol>';
}
function stepHead(n,title,sub){return '<div class="cs6-stephead"><span class="cs6-num">'+n+'</span><div><h3>'+E(title)+'</h3>'+(sub?'<p class="cs6-muted">'+sub+'</p>':'')+'</div></div>';}
function governanceHtml(m){
  const c=m.context,code=c.creativeSetStatus||"PENDING",vs=variantStatus(m.variants[m.language]);
  return '<div class="cs6-state"><div><span class="cs6-muted">Set creativo</span><b>'+E(SET_LABEL[String(code).toUpperCase()]||code)+' <code>'+E(code)+'</code></b></div><p data-set-help>'+E(setHelp(m))+'</p></div>'+
    '<div class="cs6-state"><div><span class="cs6-muted">Variante '+E(m.language)+'</span><b data-variant-status>'+E(VARIANT_LABEL[vs]||vs)+' <code>'+E(vs)+'</code></b></div><p data-variant-help>'+E(variantHelp(m))+'</p></div>';
}
function systemsHtml(m){
  const auto=m.selection.systemId,shown=m.inspect||m.layout;
  return Object.values(Lib().CREATIVE_SYSTEMS).map(sys=>'<button type="button" class="cs6-sys" data-layout="'+E(sys.id)+'" aria-pressed="'+(shown===sys.id)+'" '+(m.busy?'disabled':'')+'><b>'+E(sys.name)+(sys.id===auto?'<span class="cs6-badge">RECOMENDADO</span>':'')+'</b><small>'+E(sys.use)+'</small></button>').join("");
}
function techHtml(m){
  const c=m.context,sysName=id=>(Lib().CREATIVE_SYSTEMS[id]||{}).name||id;
  const rows=[["Campaign ID",c.campaignId],["Objective",objectiveOf(c)],["Service",c.service],["Angle",c.messageAngle],["Audience",c.audienceId],["Playbook",c.playbookId],["Language",c.language||"AUTO PER CONTACT"],["Audience status",c.audienceResolved?"RESOLVED":"UNRESOLVED"],["Creative set",c.creativeSetStatus||"PENDING"],["Approval status",c.approvalStatus],["Test draft review required",c.testDraftReviewRequired?"YES":"NO"],["Committed system",m.layout]];
  return '<details class="cs6-panel cs6-tech" data-tech'+(view.techOpen?' open':'')+'><summary>Detalles técnicos</summary>'+
    '<dl class="cs6-kv" data-intake>'+rows.map(([k,val])=>'<div><dt>'+E(k)+'</dt><dd>'+E(val==null||val===""?"—":val)+'</dd></div>').join("")+'</dl>'+
    '<p class="cs6-why"><strong>'+E(INTAKE_QUESTION)+'</strong> <span class="cs6-badge" data-intake-answer>'+E(INTAKE_BY_OBJECTIVE[objectiveOf(c)]||"UNANSWERED")+'</span></p>'+
    '<p class="cs6-why" data-design-selection>Design selected automatically: <strong>'+E(sysName(m.selection.systemId))+'</strong> ('+E(m.selection.rule)+') — '+E(m.selection.reason)+'</p>'+
    '<p class="cs6-why">Governance: the approved HTML is exactly the HTML in the preview, with {{firstName}} and {{company}} kept as tokens; AURA merges them per contact at send time (GOVERNED_TOKEN_MERGE_V1). A test draft is an unsent Gmail draft. Editing a field or changing the system revokes the affected approvals.</p></details>';
}
function draw(){
  const m=model;if(!mount||!m)return;ensureStyles();const c=m.context,v=m.variants[m.language],sysName=id=>(Lib().CREATIVE_SYSTEMS[id]||{}).name||id;
  const inspecting=m.inspect&&m.inspect!==m.layout,langs=(c.requiredLanguages||[]).join(" / ")||"—",r=previewRecipient(m);
  mount.innerHTML='<div class="cs6">'+
    '<div class="cs6-head"><div><div class="cs6-eyebrow">CAMPAIGN STUDIO</div><h2>'+E(c.campaignName)+'</h2><div class="cs6-muted">'+E([objectiveOf(c),c.service].filter(Boolean).join(" · "))+'</div></div><button type="button" class="btn cs6-back" data-picker>&larr; Todas las campañas</button></div>'+
    stepperHtml(m)+
    '<div class="cs6-ws"><div class="cs6-col">'+
      '<section class="cs6-panel" data-step="audience">'+stepHead(1,"Audiencia",c.audienceResolved?"Audiencia resuelta. AURA elige el idioma de cada contacto automáticamente.":"<strong>Audiencia sin resolver:</strong> las aprobaciones y los borradores de prueba están bloqueados.")+
        '<div class="cs6-facts"><div><b>'+E(c.eligibleContacts??"—")+'</b><span>contactos elegibles</span></div><div><b>'+E(c.excludedContacts??"—")+'</b><span>contactos excluidos</span></div><div><b>'+E(langs)+'</b><span>idiomas requeridos</span></div></div></section>'+
      '<section class="cs6-panel" data-step="design">'+stepHead(2,"Diseño","Elegimos el diseño recomendado para este tipo de campaña. Puedes comparar otros sin aprobar ni revocar nada.")+
        '<div class="cs6-systems">'+systemsHtml(m)+'</div>'+
        (inspecting?'<div class="cs6-inspect" data-inspect-note><span>Comparando <strong>'+E(sysName(m.inspect))+'</strong>: solo vista previa, no se aprueba ni revoca nada.</span><span class="cs6-actions"><button type="button" class="btn" data-inspect-back>Volver a '+E(sysName(m.layout))+'</button><button type="button" class="btn btn-primary" data-inspect-use>Usar este diseño</button></span></div>':'')+
        '<div class="cs6-sub">Idioma</div><div class="cs6-tabs" role="tablist" aria-label="Idioma de la variante">'+LANGUAGES.map(l=>{const s=variantStatus(m.variants[l]);return '<button type="button" class="cs6-tab" role="tab" aria-selected="'+(m.language===l)+'" data-language="'+l+'" '+(m.busy?'disabled':'')+'><b>'+l+'</b><small>'+E(VARIANT_LABEL[s]||s)+'</small></button>';}).join("")+'</div>'+
        '<details class="cs6-edit" data-edit'+(view.editOpen?' open':'')+'><summary>Editar textos · '+E(m.language)+' <span class="cs6-muted">(opcional; editar revoca la aprobación de este idioma)</span></summary><fieldset style="border:0;padding:0;margin:10px 0 0" '+(m.busy?'disabled':'')+'>'+FIELDS.map(k=>'<label class="cs6-field">'+E(FIELD_LABEL[k]||k)+'<textarea data-copy="'+k+'" rows="2">'+E(v.copy[k])+'</textarea></label>').join("")+'</fieldset></details></section>'+
      '<section class="cs6-panel" data-step="approval">'+stepHead(4,"Aprobación","Revisa la vista previa y aprueba cada idioma. Después aprueba el set completo.")+
        '<div class="cs6-gov" data-governance>'+governanceHtml(m)+'</div>'+
        '<p class="cs6-alert" role="alert">'+E(friendlyError(m.error))+'</p><div class="cs6-actions">'+[["variant","Aprobar variante "+m.language,"btn-primary"],["draft","Crear borrador de prueba",""],["set","Aprobar set creativo","btn-primary"]].map(([a,label,cls])=>'<button type="button" class="btn '+cls+'" data-action="'+a+'" '+(actionDisabled(m,a)?'disabled':'')+'>'+E(label)+'</button>').join("")+'</div>'+
        '<p class="cs6-muted cs6-hint" data-action-hint>'+E(actionHint(m))+'</p></section>'+
      techHtml(m)+
    '</div>'+
    '<div class="cs6-col cs6-previewcol"><section class="cs6-panel" data-step="preview"><div class="cs6-previewbar">'+stepHead(3,"Vista previa · "+m.language,'<span data-preview-label>'+E(sysName(m.inspect||m.layout))+'</span>')+'<div class="cs6-device" role="group" aria-label="Ancho de la vista previa">'+["desktop","mobile"].map(d=>'<button type="button" data-device="'+d+'" aria-pressed="'+(view.device===d)+'">'+(d==="desktop"?"Escritorio":"Móvil")+'</button>').join("")+'</div></div>'+
      '<p class="cs6-person" data-sample-note>'+(r?'Personalizada para <strong>'+E([r.firstName,r.company].filter(Boolean).join(" · "))+'</strong>'+(r.source?' <span class="cs6-muted">('+E(r.source)+')</span>':'')+(r.firstName&&r.company?'':'. Lo que no tiene dato verificado aparece marcado.'):'Sin contacto verificado para personalizar: <mark>[Nombre]</mark> y <mark>[Empresa]</mark> se muestran marcados. AURA los completa con los datos de cada contacto al enviar.')+'</p>'+
      '<iframe data-preview class="cs6-frame'+(view.device==="mobile"?" is-mobile":"")+'" title="Vista previa del email '+m.language+'" sandbox=""></iframe></section></div>'+
    '</div></div>';
  bindWorkspace(m);preview();
}
function bindWorkspace(m){
  const q=s=>mount.querySelector(s),qa=s=>mount.querySelectorAll(s)||[];
  const picker=q("[data-picker]");if(picker)picker.onclick=()=>backToList();
  qa("[data-language]").forEach(b=>b.onclick=()=>{selectLanguage(m,b.dataset.language);draw();});
  // Gallery: inspecting another system is preview-only (no revoke); committing uses changeLayout.
  qa("[data-layout]").forEach(b=>b.onclick=()=>{m.inspect=b.dataset.layout===m.layout?null:b.dataset.layout;draw();});
  const back=q("[data-inspect-back]");if(back)back.onclick=()=>{m.inspect=null;draw();};
  const use=q("[data-inspect-use]");if(use)use.onclick=async()=>{const target=m.inspect;m.busy=true;draw();try{await changeLayout(m,target);m.inspect=null;}catch(e){m.error=e.message;}finally{m.busy=false;draw();}};
  qa("[data-device]").forEach(b=>b.onclick=()=>{view.device=b.dataset.device;const f=q("[data-preview]");if(f&&f.classList)f.classList.toggle("is-mobile",view.device==="mobile");qa("[data-device]").forEach(x=>x.setAttribute&&x.setAttribute("aria-pressed",String(x.dataset.device===view.device)));});
  qa("[data-copy]").forEach(e=>e.oninput=()=>{editCopy(m,e.dataset.copy,e.value).catch(err=>{m.error=err.message;const a=q('[role="alert"]');if(a)a.textContent=friendlyError(m.error);});preview();});
  qa("[data-action]").forEach(b=>b.onclick=()=>run(b.dataset.action));
  // Remember which collapsible panels are open across redraws.
  const tech=q("[data-tech]");if(tech)tech.ontoggle=()=>{view.techOpen=tech.open;};
  const edit=q("[data-edit]");if(edit)edit.ontoggle=()=>{view.editOpen=edit.open;};
}
// Light update (no full redraw): preview HTML, statuses and action states only.
function preview(){
  if(!mount||!model)return;
  const frame=mount.querySelector("[data-preview]");if(frame)frame.srcdoc=personalizePreview(previewHtml(model),previewRecipient(model));
  (mount.querySelectorAll("[data-language]")||[]).forEach(b=>{const s=b.querySelector&&b.querySelector("small"),st=variantStatus(model.variants[b.dataset.language]);if(s)s.textContent=VARIANT_LABEL[st]||st;});
  (mount.querySelectorAll("[data-action]")||[]).forEach(b=>b.disabled=actionDisabled(model,b.dataset.action));
  const vs=variantStatus(model.variants[model.language]),status=mount.querySelector("[data-variant-status]");if(status)status.textContent=(VARIANT_LABEL[vs]||vs)+" · "+vs;
  [["[data-variant-help]",variantHelp(model)],["[data-set-help]",setHelp(model)],["[data-action-hint]",actionHint(model)]].forEach(([sel,t])=>{const e=mount.querySelector(sel);if(e)e.textContent=t;});
}
async function render(container,explicitId){
  mount=container;ensureStyles();const ticket=++epoch,id=explicitId===undefined?navigationId():explicitId;model=null;inFlight++;
  container.innerHTML='<div class="cs6"><div class="cs6-head"><div><div class="cs6-eyebrow">CAMPAIGN STUDIO</div><h2>'+(id?'Cargando campaña…':'Elige una campaña')+'</h2></div></div><p class="cs6-muted">Conectando con el backend privado…</p></div>';
  try{
    if(!api()?.isConnected?.())throw Error("Connect the private backend to open Campaign Studio.");
    if(!id){
      const list=await loadCampaignList();if(ticket!==epoch)return;
      container.innerHTML='<div class="cs6"><div class="cs6-head"><div><div class="cs6-eyebrow">CAMPAIGN STUDIO</div><h2>Elige una campaña</h2><div class="cs6-muted">Busca o filtra y abre una campaña para revisar su email.</div></div><button type="button" class="btn" data-reload-list>Actualizar lista</button></div>'+selectorHtml(list,"")+'</div>';
      const reload=container.querySelector("[data-reload-list]");if(reload)reload.onclick=async()=>{try{g.sessionStorage?.removeItem(LIST_KEY);}catch(_){}cache.list=null;await loadCampaignList(true);render(container,"");};
      bindSelector(container,list,"");
      return;
    }
    // Context and (in parallel) the campaign list warm-up; approved variants are then fetched in parallel.
    const listWarm=loadCampaignList().catch(()=>null);
    const context=cache.contexts.get(id)||await api().campaignStudioContext(id);if(ticket!==epoch)return;
    if(context.campaignId!==id)throw Error("Campaign context mismatch");
    cache.contexts.set(id,context);
    try{sessionStorage.setItem(KEY,"{}");}catch(_){}
    model=createModel(context);
    const approvedLanguages=LANGUAGES.filter(l=>model.variants[l].approved);
    // One request when the backend bundles the approved creatives into the context; otherwise
    // the previous per-language reads (in parallel).
    const bundled=context.approvedCreatives||{};
    const records=await Promise.all(approvedLanguages.map(l=>Object.prototype.hasOwnProperty.call(bundled,l)?bundled[l]:api().getLatestApprovedCreative(id,l).catch(()=>null)));if(ticket!==epoch)return;
    approvedLanguages.forEach((l,i)=>{
      const v=model.variants[l],record=records[i];
      // An approved creative persisted by a retired renderer (templateId not in the design
      // library, e.g. the old generic "editorial") is shown as legacy: the premium preview from
      // the automatic selection is displayed instead. Nothing is revoked or overwritten; approving
      // the new preview creates a new version that supersedes it.
      if(record?.creativeId===v.creativeId&&!validSystem(record.templateId)){v.approved=false;v.dirty=true;v.legacyTemplate=String(record.templateId||"");v.legacyCreativeVersion=record.creativeVersion;return;}
      if(record?.creativeId===v.creativeId){model.layout=record.templateId;v.storedHtml=record.htmlBody;v.storedText=record.textBody;v.copy.subjectA=record.subject;v.copy.preheader=record.preheader;if(record.creativeCopy){try{v.copy=JSON.parse(record.creativeCopy);}catch(_){}}}
      else{v.approved=false;v.dirty=true;}
    });
    draw();
    listWarm.then(()=>{});
  }catch(e){if(ticket===epoch)container.innerHTML='<div class="cs6"><div class="cs6-head"><div><div class="cs6-eyebrow">GOVERNED CAMPAIGN STUDIO</div><h2>No se pudo abrir la campaña</h2></div></div><p class="cs6-alert" role="alert">'+E(friendlyError(e.message))+'</p></div>';}
  finally{inFlight--;}
}
g.DGL_CAMPAIGN_STUDIO_V6={version:"governed-premium-v4",previewHtml,personalizePreview,previewRecipient,statusHelp,friendlyError,filterCampaigns,normalizeCampaign,loadCampaignList,openCampaign,INTAKE_QUESTION,INTAKE_OPTIONS,autoSystem,render,createModel,canApproveSet,variantStatus,selectLanguage,editCopy,changeLayout,emailHtml,validateBrand,navigationId,getState:()=>model};
g.DGL_MODULE_RENDERERS=g.DGL_MODULE_RENDERERS||{};g.DGL_MODULE_RENDERERS["campaign-studio"]=render;
// Re-render only when the backend actually becomes connected, never while a render is in flight.
// A failing context call emits a backend-change event from inside the render; re-rendering on that
// event re-issued the same failing call in a synchronous promise chain and froze the page.
let lastBackendState=null;
g.addEventListener?.("dgl:v55-backend-change",e=>{const s=e?.detail?.state||"";const becameConnected=s==="PRIVATE_BACKEND"&&lastBackendState!=="PRIVATE_BACKEND";lastBackendState=s;if(!becameConnected||inFlight)return;if(g.location?.hash.includes("campaign-studio")&&!model&&mount)render(mount);});
})(window);
