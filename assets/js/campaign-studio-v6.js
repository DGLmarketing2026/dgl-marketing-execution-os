(function(g){
"use strict";
const KEY="dgl_v5_campaign_context";
const LOGO="https://dglmarketing2026.github.io/dgl-marketing-execution-os/assets/brand/dgl-logo-white.png";
const LANGUAGES=["ES","EN","PT"],FIELDS=["subjectA","subjectB","preheader","headline","body","body2","cta"];
const E=v=>String(v==null?"":v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const api=()=>g.DGL_MARKETING_BACKEND_ADAPTER_V55;
let model=null,mount=null,epoch=0;
function navigationId(){
  const q=new URLSearchParams((g.location.hash||"").split("?")[1]||"");
  if(q.has("campaignId"))return q.get("campaignId")||"";
  return "";
}
function createModel(context){
  const m={context:Object.freeze({...context}),language:(context.requiredLanguages||[])[0]||"ES",layout:"editorial",variants:{},brand:null,busy:false,error:"",pendingRevokes:new Set()};
  LANGUAGES.forEach(language=>{
    const approved=context.approvedCreativeVariants?.[language];
    m.variants[language]={copy:g.DGL_COPY_ENGINE_V5.generate({objective:context.objective,service:context.service,angle:context.messageAngle,language,ctaIntent:"Send Requirement"}),dirty:!approved,testDraftStatus:"NOT CREATED",approved:!!approved,...(approved||{})};
  });return m;
}
function selectLanguage(m,language){if(!LANGUAGES.includes(language))throw Error("Unsupported language");m.language=language;}
async function revoke(m,languages){
  const ids=[];
  // Resolve latest backend approvals too: another tab may have approved since this view loaded.

  languages.forEach(l=>{
    const v=m.variants[l];if(v.creativeId)m.pendingRevokes.add(v.creativeId);
    v.dirty=true;v.approved=false;v.storedHtml=null;
    if(v.testDraftStatus==="CREATED")v.testDraftStatus="STALE AFTER EDIT";
    ["creativeId","creativeVersion","approvalId","htmlChecksum","contentChecksum"].forEach(k=>delete v[k]);
  });
  m.context=Object.freeze({...m.context,creativeSetStatus:"PENDING",approvalStatus:"PENDING"});
  if(api().campaignStudioContext){const current=await api().campaignStudioContext(m.context.campaignId);languages.forEach(l=>{const id=current.approvedCreativeVariants?.[l]?.creativeId;if(id)m.pendingRevokes.add(id);});}
  for(const id of m.pendingRevokes)ids.push(id);
  for(const id of ids){await api().revokeApprovedCreative(id,"Marketing");m.pendingRevokes.delete(id);}
}
async function editCopy(m,field,value){if(!FIELDS.includes(field))return;const language=m.language;m.variants[language].copy[field]=value;const pending=revoke(m,[language]),current=Promise.all([m.revoking?m.revoking.catch(()=>{}):Promise.resolve(),pending]);m.revoking=current;try{await current;}finally{if(m.revoking===current)m.revoking=null;}}
async function changeLayout(m,value){m.layout=value;await revoke(m,LANGUAGES);}
function emailHtml(m,language=m.language){
  const v=m.variants[language];if(v.storedHtml&&!v.dirty)return v.storedHtml;
  const c=v.copy,space=m.layout==="executive"?44:36;
  return '<!doctype html><html lang="'+language.toLowerCase()+'"><body style="margin:0;background:#F3F5F7"><div style="display:none;max-height:0;overflow:hidden">'+E(c.preheader)+'</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="680" cellspacing="0" cellpadding="0" style="width:100%;max-width:680px;background:white"><tr><td style="background:#05035C;padding:24px 36px;border-bottom:4px solid #77B82A"><img src="'+LOGO+'" alt="DGL" width="184" style="display:block;width:184px;height:auto;border:0"></td></tr><tr><td style="padding:'+space+'px;font-family:Arial,sans-serif"><h1 style="font-size:34px;line-height:1.12;color:#05035C;margin:0 0 28px">'+E(c.headline)+'</h1><p style="font-size:16px;line-height:1.7;color:#475467">'+E(c.body)+'</p><p style="font-size:16px;line-height:1.7;color:#475467;margin-bottom:30px">'+E(c.body2)+'</p><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="background:#77B82A;padding:16px 24px"><a href="mailto:info@dglus.com?subject='+encodeURIComponent(language==="ES"?"Requerimiento terrestre":language==="PT"?"Requerimento terrestre":"Ground freight requirement")+'" style="font-weight:bold;font-size:13px;color:#05035C;text-decoration:none">'+E(c.cta)+'</a></td></tr></table></td></tr><tr><td style="padding:24px 36px;border-top:1px solid #EAECF0;color:#667085;font:11px Arial">Dedicated Ground Logistics · Your inland freight partner.</td></tr></table></td></tr></table></body></html>';
}
function validateBrand(){
  return new Promise((resolve,reject)=>{
    const img=new Image(),timer=setTimeout(()=>reject(Error("Logo load timed out")),15000);
    img.onload=()=>{clearTimeout(timer);if(img.src!==LOGO||!img.complete||img.naturalWidth<=0)return reject(Error("Canonical logo failed validation"));resolve({url:img.src,naturalWidth:img.naturalWidth});};
    img.onerror=()=>{clearTimeout(timer);reject(Error("Canonical logo did not load"));};img.src=LOGO;
  });
}
function payload(m){
  const c=m.variants[m.language].copy;
  return {language:m.language,subject:c.subjectA,preheader:c.preheader,htmlBody:emailHtml(m),textBody:[c.headline,c.body,c.body2,c.cta].join("\n\n"),templateId:m.layout,logoUrl:LOGO,heroUrl:"",approvedBy:"Marketing",creativeCopy:c,brandValidation:m.brand};
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
      Object.assign(m.variants[m.language],record,{approved:true,dirty:false});
      m.context=Object.freeze(await api().campaignStudioContext(c.campaignId));
    }else if(action==="set"){
      m.context=Object.freeze(await api().approveCreativeSet(c.campaignId));
    }else if(action==="draft"){
      await api().campaignStudioTestDraft(c.campaignId,payload(m));
      m.variants[m.language].testDraftStatus="CREATED";
    }
  }catch(e){m.error=e.message||String(e);}finally{m.busy=false;if(model===m)draw();}
}
function preview(){
  if(!mount||!model)return;
  const frame=mount.querySelector("[data-preview]");if(frame)frame.srcdoc=emailHtml(model);
  const status=mount.querySelector("[data-variant-status]");
  if(status){const v=model.variants[model.language];status.textContent=model.language+" · "+(v.approved?"APPROVED":"UNAPPROVED")+" · "+v.testDraftStatus;}
}
function draw(){
  const m=model;if(!mount||!m)return;const c=m.context,v=m.variants[m.language];
  mount.innerHTML='<div class="page-head"><div><div class="eyebrow">GOVERNED CAMPAIGN STUDIO</div><h2>'+E(c.campaignName)+'</h2><p>Private backend strategy · Creative fields only</p></div><button class="btn" data-picker>SELECT CAMPAIGN</button></div>'+
    '<section class="card card-pad"><dl style="display:flex;flex-wrap:wrap;gap:24px">'+["objective","service","scopeId","playbookId","messageAngle","language"].map(k=>'<div><dt>'+E(k)+'</dt><dd style="margin:8px 0;font-weight:bold">'+E(c[k])+'</dd></div>').join("")+'</dl><p>'+E(c.eligibleContacts)+' eligible contacts · '+E(c.eligibleAccounts)+' unique accounts · '+E(c.excludedContacts)+' excluded contacts</p><p>Creative set: '+E(c.creativeSetStatus)+' · Required: '+E((c.requiredLanguages||[]).join(" / "))+'</p></section>'+
    '<section class="card card-pad" style="margin-top:20px"><h3>Creative System</h3><div style="display:flex;gap:12px">'+["editorial","executive"].map(l=>'<button class="btn" data-layout="'+l+'" '+(m.busy?'disabled':'')+'>'+E(l)+'<br><small>'+E([c.objective,c.service,c.messageAngle,m.language].join(" · "))+'</small></button>').join("")+'</div></section>'+
    '<div role="tablist" aria-label="Creative language" style="display:flex;gap:12px;margin:24px 0">'+LANGUAGES.map(l=>'<button class="btn '+(m.language===l?'btn-primary':'')+'" role="tab" aria-selected="'+(m.language===l)+'" data-language="'+l+'" '+(m.busy?'disabled':'')+'>'+l+'</button>').join("")+'</div>'+
    '<p data-variant-status></p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px"><fieldset style="border:0;padding:0" '+(m.busy?'disabled':'')+'>'+FIELDS.map(k=>'<label style="display:block;margin-bottom:14px">'+E(k)+'<textarea data-copy="'+k+'" style="display:block;width:100%;min-height:65px;padding:12px;box-sizing:border-box">'+E(v.copy[k])+'</textarea></label>').join("")+'</fieldset><iframe data-preview title="'+m.language+' email preview" sandbox="" style="width:100%;height:820px;border:1px solid #ddd;background:white"></iframe></div>'+
    '<p role="alert">'+E(m.error)+'</p><div style="display:flex;gap:12px;flex-wrap:wrap">'+[["draft","CREATE TEST DRAFT"],["variant","APPROVE VARIANT"],["set","APPROVE CREATIVE SET"]].map(([a,label])=>'<button class="btn btn-primary" data-action="'+a+'" '+(m.busy||!c.audienceResolved?'disabled':'')+'>'+label+'</button>').join("")+'</div><p>Test Draft creates an unsent Gmail draft. Logo validation runs before approval.</p>';
  mount.querySelector("[data-picker]").onclick=()=>{g.location.hash="#/campaign-studio";render(mount,"");};
  mount.querySelectorAll("[data-language]").forEach(b=>b.onclick=()=>{selectLanguage(m,b.dataset.language);draw();});
  mount.querySelectorAll("[data-layout]").forEach(b=>b.onclick=async()=>{m.busy=true;draw();try{await changeLayout(m,b.dataset.layout);}catch(e){m.error=e.message;}finally{m.busy=false;draw();}});
  mount.querySelectorAll("[data-copy]").forEach(e=>e.oninput=()=>{editCopy(m,e.dataset.copy,e.value).catch(err=>{m.error=err.message;const a=mount.querySelector('[role="alert"]');if(a)a.textContent=m.error;});preview();});
  mount.querySelectorAll("[data-action]").forEach(b=>b.onclick=()=>run(b.dataset.action));preview();
}
async function render(container,explicitId){
  mount=container;const ticket=++epoch,id=explicitId===undefined?navigationId():explicitId;model=null;
  container.innerHTML='<h2>'+(id?'LOADING GOVERNED CAMPAIGN':'SELECT A CAMPAIGN TO OPEN IN STUDIO')+'</h2><p>Loading private backend…</p>';
  try{
    if(!api()?.isConnected?.())throw Error("Connect the private backend to open Campaign Studio.");
    if(!id){
      const result=await api().campaignStudioList();if(ticket!==epoch)return;
      container.innerHTML='<h2>SELECT A CAMPAIGN TO OPEN IN STUDIO</h2><div class="card card-pad">'+(result.campaigns||[]).map(c=>'<button class="btn" data-campaign="'+E(c.campaignId)+'">'+E(c.campaignName)+'</button>').join("")+'</div>';
      container.querySelectorAll("[data-campaign]").forEach(b=>b.onclick=()=>{g.location.hash="#/campaign-studio?campaignId="+encodeURIComponent(b.dataset.campaign);});return;
    }
    const context=await api().campaignStudioContext(id);if(ticket!==epoch)return;
    if(context.campaignId!==id)throw Error("Campaign context mismatch");
    sessionStorage.setItem(KEY,"{}");
    model=createModel(context);
    for(const l of LANGUAGES){
      const v=model.variants[l];if(!v.approved)continue;
      const record=await api().getLatestApprovedCreative(id,l);if(ticket!==epoch)return;
      if(record?.creativeId===v.creativeId){model.layout=record.templateId||model.layout;v.storedHtml=record.htmlBody;v.copy.subjectA=record.subject;v.copy.preheader=record.preheader;if(record.creativeCopy){try{v.copy=JSON.parse(record.creativeCopy);}catch(_){}}}
      else{v.approved=false;v.dirty=true;}
    }
    draw();
  }catch(e){if(ticket===epoch)container.innerHTML='<h2>SELECT A CAMPAIGN TO OPEN IN STUDIO</h2><p role="alert">'+E(e.message)+'</p>';}
}
g.DGL_CAMPAIGN_STUDIO_V6={version:"governed-activation-v2",render,createModel,selectLanguage,editCopy,changeLayout,emailHtml,validateBrand,navigationId,getState:()=>model};
g.DGL_MODULE_RENDERERS=g.DGL_MODULE_RENDERERS||{};g.DGL_MODULE_RENDERERS["campaign-studio"]=render;
g.addEventListener?.("dgl:v55-backend-change",()=>{if(g.location?.hash.includes("campaign-studio")&&!model&&mount)render(mount);});
})(window);
