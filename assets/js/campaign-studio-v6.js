(function(g){
"use strict";
// V6 alone owns navigation and canonical context; V5 supplies the editor and renderer.
const NAV="dgl_studio_navigation", VERSION=1, A=()=>g.DGL_MARKETING_BACKEND_ADAPTER_V55,F=()=>g.DGL_CAMPAIGN_STUDIO_V5;
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;");
let context=null, variants={}, active="", system="editorial-white", mount=null, generation=0, busy=false, message="", brandLoaded=false;
const cleanVariant=copy=>({copy,dirty:true,approved:false,creativeId:null,creativeVersion:null,approvalId:null,htmlChecksum:null,contentChecksum:null,testDraftStatus:"NOT CREATED",revokePending:null});
function navigation(){try {const x=JSON.parse(sessionStorage.getItem(NAV)||"null");sessionStorage.removeItem(NAV);return x?.version===VERSION?x:null;}catch(_){return null;}}
function openCampaign(campaignId){
  if(!campaignId)throw new Error("CAMPAIGN_ID_REQUIRED");
  sessionStorage.removeItem("dgl_v5_campaign_context");
  sessionStorage.setItem(NAV,JSON.stringify({version:VERSION,campaignId}));
  if(g.location.hash==="#/campaign-studio"&&mount)return render(mount);
  g.location.hash="#/campaign-studio";
}
function openScope(scope){
  if(!scope?.scopeId)throw new Error("EXPLICIT_SCOPE_REQUIRED");
  sessionStorage.removeItem("dgl_v5_campaign_context");
  sessionStorage.setItem(NAV,JSON.stringify({version:VERSION,mode:"EXPLICIT_NEW_SCOPE",scope:{scopeId:scope.scopeId}}));
  g.location.hash="#/campaign-studio";
}
function checksum(s){let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return h;}
function strategy(){return {...context,language:active,angle:context.messageAngle,ctaIntent:context.objective==="Activation"?"Send Requirement":undefined,creativeSystem:system};}
function preview(){return F().governedEmail(strategy(),variants[active].copy);}
function contentQA(html){return ["subjectA","preheader","headline","body","body2","cta"].every(k=>String(variants[active].copy[k]||"").trim()) && !/\b(Activation|Retention|Reactivation|Cross[- ]Sell|QNB|Nurture|campaignId|playbookId|stages|scores)\b/i.test([variants[active].copy.subjectA,html].join(' ')) && (context.objective!=="Activation" || !/Stay Close|Staying Close|Seguimos cerca|Relationship Continuity|Próximos da sua operação|Multiservicio/i.test(html)) && html.includes('href="mailto:'+context.replyTo) && html.includes('lang="'+active.toLowerCase()+'"');}
function brandQA(html){return !!context?.logoVerified&&brandLoaded&&context.logoUrl===F().officialLogo&&html.includes('src="'+F().officialLogo+'"')&&!/onerror\s*=/i.test(html);}
function setReady(){return !!context?.requiredLanguages.length && context.requiredLanguages.every(l=>variants[l]?.approved&&!variants[l].dirty&&!variants[l].revokePending);}
function renderEditor(){
  if(!mount||!context)return;
  const html=preview(),qa=brandQA(html)&&contentQA(html)&&context.audienceResolved, v=variants[active];
  mount.innerHTML=F().governedPanel(context,{variant:v,variants,languages:Object.keys(variants),strategy:strategy(),busy,
    qa:!brandQA(html)?"CANONICAL DGL LOGO NOT LOADED · BRAND QA FAIL":!contentQA(html)?"CONTENT / VARIANT QA FAIL":!context.audienceResolved?"AUDIENCE UNRESOLVED":"BRAND / CONTENT / SELECTED VARIANT == RENDERED VARIANT: PASS",
    message,canApprove:qa&&!v.revokePending&&context.requiredLanguages.includes(active),canApproveSet:qa&&setReady(),canTest:qa&&v.approved&&!v.dirty});
  const frame=mount.querySelector('[data-studio-preview]');if(frame)frame.srcdoc=html;
}
async function bind(campaignId){
  const ticket=++generation;context=null;variants={};brandLoaded=false;
  const c=await A().getCampaignStudioContext(campaignId);
  if(ticket!==generation)return;
  if(c.contextVersion!==VERSION||c.campaignId!==campaignId)throw new Error("CAMPAIGN_CONTEXT_MISMATCH");
  if(!c.objective||!c.service||!c.scopeId||!c.audienceId||!c.playbookId)throw new Error("CANONICAL_CONTEXT_UNRESOLVED");
  context=Object.freeze({...c,requiredLanguages:Object.freeze([...c.requiredLanguages]),languageCounts:Object.freeze({...c.languageCounts})});
  const compatible=F().compatibleSystems(c);
  if(!compatible.length)throw new Error("NO_COMPATIBLE_CREATIVE_SYSTEM");
  system=compatible[0].id;
  let restoredSystem=null;
  const languages=c.campaignId==="CMP-CAMPANA-A-HA-PRIORITARIA"?['ES','EN','PT']:c.requiredLanguages;
  if(!languages.length)throw new Error("NO_ELIGIBLE_LANGUAGE_VARIANTS");
  languages.forEach(l=>{variants[l]=cleanVariant(g.DGL_COPY_ENGINE_V5.generate({...c,angle:c.messageAngle,language:l,ctaIntent:c.objective==='Activation'?'Send Requirement':undefined}));});
  active=languages[0];
  for(const entry of c.approvedCreativeVariants||[]){
    const r=await A().getLatestApprovedCreative(campaignId,entry.language);
    if(ticket!==generation)return;
    const copy=r&&F().storedCopy(r.htmlBody);
    if(!variants[entry.language])continue;
    // Legacy creatives without editable metadata stay non-editable approved records;
    // replacing their draft still revokes the precise existing creative ID.
    Object.assign(variants[entry.language],entry,{approved:!!copy,dirty:!copy});
    if(copy){
      if(!compatible.some(x=>x.id===r.templateId)||restoredSystem&&restoredSystem!==r.templateId){await revoke(entry.language);continue;}
      restoredSystem=r.templateId;system=r.templateId;
      variants[entry.language].copy=copy;
      const expected=F().governedEmail({...context,language:entry.language,angle:context.messageAngle,creativeSystem:r.templateId},copy);
      if(expected!==r.htmlBody||checksum(r.htmlBody)!==r.htmlChecksum||r.subject!==copy.subjectA)await revoke(entry.language);
    }
  }
  if(g.Image){const logo=new g.Image();logo.onload=()=>{if(ticket!==generation)return;brandLoaded=logo.naturalWidth>0&&logo.src===F().officialLogo;renderEditor();};logo.onerror=()=>{if(ticket!==generation)return;brandLoaded=false;renderEditor();};logo.src=F().officialLogo;}
  renderEditor();return context;
}
function switchLanguage(l){if(busy||!variants[l])return;active=l;renderEditor();}
async function revoke(l){
  const v=variants[l],id=v.creativeId;
  message="CREATIVE SET APPROVAL REQUIRED";v.approved=false;v.dirty=true;if(v.testDraftStatus==="CREATED")v.testDraftStatus="STALE AFTER EDIT";
  if(!id)return;
  v.revokePending=id;
  try{const result=await A().revokeApprovedCreative(id,"Marketing Studio edit");if(!result||!['REVOKED','ALREADY_REVOKED'].includes(result.status))throw new Error("REVOCATION_NOT_CONFIRMED");v.revokePending=null;v.creativeId=null;}
  catch(e){message="REVOCATION BLOCKED: "+e.message;throw e;}
}
async function editCopy(key,value){
  if(busy||!Object.hasOwn(variants[active].copy,key))return;
  const l=active;variants[l].copy[key]=value;
  // Call revocation once per approved record. Subsequent edits cannot unblock a failure.
  if(variants[l].revokePending)throw new Error("REVOCATION_PENDING");
  await revoke(l);
}
async function invalidateAll(){await Promise.all(Object.keys(variants).map(revoke));}
async function changeSystem(next){
  if(busy||next===system)return;
  if(!F().compatibleSystems(strategy()).some(x=>x.id===next))throw new Error("INCOMPATIBLE_CREATIVE_SYSTEM");
  busy=true;try{await invalidateAll();system=next;}finally{busy=false;renderEditor();}
}
async function approveVariant(){
  if(busy)throw new Error("STUDIO_BUSY");
  const html=preview(),v=variants[active];
  if(!brandQA(html)||!contentQA(html)||!context.audienceResolved||v.revokePending)throw new Error("APPROVAL_QA_BLOCKED");
  busy=true;renderEditor();
  try{
    const r=await A().approveCreative(context.campaignId,{language:active,subject:v.copy.subjectA,preheader:v.copy.preheader,htmlBody:html,textBody:[v.copy.headline,v.copy.body,v.copy.body2,v.copy.cta].join('\n\n'),templateId:system,logoUrl:F().officialLogo,heroUrl:'',approvedBy:"Marketing Studio"});
    if(!r?.creativeId||!r.approvalId||!r.htmlChecksum||!r.contentChecksum||!(Number(r.creativeVersion)>0))throw new Error("APPROVAL_INCOMPLETE");
    const expectedContent=checksum([v.copy.subjectA,html,[v.copy.headline,v.copy.body,v.copy.body2,v.copy.cta].join('\n\n'),system,String(r.creativeVersion)].join('\u0001'));
    if(r.htmlChecksum!==checksum(html)||r.contentChecksum!==expectedContent){v.creativeId=r.creativeId;await revoke(active);throw new Error("APPROVAL_CHECKSUM_MISMATCH");}
    Object.assign(v,r,{approved:true,dirty:false});
  }finally{busy=false;renderEditor();}
}
async function approveSet(){
  if(busy||!setReady()||!brandQA(preview()))throw new Error("CREATIVE_SET_INCOMPLETE");
  busy=true;renderEditor();try{await A().approveCreativeSet(context.campaignId,"Marketing Studio");message="CREATIVE SET APPROVED";}finally{busy=false;renderEditor();}
}
async function testDraft(){
  const v=variants[active];
  if(busy||!v.approved||v.dirty||v.revokePending||!brandQA(preview()))throw new Error("APPROVED_VARIANT_REQUIRED_FOR_EXACT_TEST");
  const html=preview();busy=true;renderEditor();
  try{await A().createTestDraft(context.campaignId,{language:active,subject:v.copy.subjectA,htmlBody:html});v.testDraftStatus="CREATED";}finally{busy=false;renderEditor();}
}
async function render(container){
  mount=container;context=null;variants={};message="";generation++;
  sessionStorage.removeItem("dgl_v5_campaign_context");
  const nav=navigation();
  if(!A()?.isConnected?.()){container.innerHTML='<h1>SELECT A CAMPAIGN TO OPEN IN STUDIO</h1><p>PRIVATE BACKEND REQUIRED</p>';return;}
  try{
    if(nav?.campaignId){container.innerHTML='<p>Loading private campaign context…</p>';await bind(nav.campaignId);return;}
    if(nav?.mode==="EXPLICIT_NEW_SCOPE"){
      container.innerHTML='<p>Preparing explicitly selected scope…</p>';
      const saved=await g.DGL_CAMPAIGN_SCOPE_BRIDGE_V6.ensureCampaignRecord(nav.scope);
      await bind(saved.campaignId);return;
    }
    await A().refresh?.();
    container.innerHTML='<h1>SELECT A CAMPAIGN TO OPEN IN STUDIO</h1><div class="governed-chooser">'+(A().getCampaigns()||[]).map(c=>'<button data-studio-open="'+esc(c.campaignId||c.id)+'">'+esc(c.campaignName||c.name||c.campaignId)+'</button>').join('')+'</div>';
  }catch(e){container.innerHTML='<h1>Campaign context unavailable</h1><p>'+esc(e.message)+'</p>';}
}
g.document?.addEventListener('click',async e=>{
  const target=e.target.closest('[data-studio-open],[data-studio-language],[data-studio-system],[data-studio-approve],[data-studio-set],[data-studio-test]');if(!target)return;
  try{if(target.dataset.studioOpen)return await openCampaign(target.dataset.studioOpen);
    if(target.dataset.studioLanguage)return switchLanguage(target.dataset.studioLanguage);
    if(target.dataset.studioSystem)return await changeSystem(target.dataset.studioSystem);
    if(target.hasAttribute('data-studio-approve'))await approveVariant();
    else if(target.hasAttribute('data-studio-set'))await approveSet();
    else if(target.hasAttribute('data-studio-test'))await testDraft();
  }catch(error){message=error.message;renderEditor();}
});
g.document?.addEventListener('change',async e=>{const key=e.target.dataset?.studioCopy;if(!key)return;try{await editCopy(key,e.target.value);}catch(error){message=error.message;}renderEditor();});
// An accessor prevents legacy renderer wrappers from replacing the governing entry point,
// irrespective of script order. They may still expose legacy helpers, never choose identity.
const registry=g.DGL_MODULE_RENDERERS=g.DGL_MODULE_RENDERERS||{};
Object.defineProperty(registry,'campaign-studio',{configurable:false,enumerable:true,get:()=>render,set:()=>{}});
g.DGL_CAMPAIGN_STUDIO_V6={version:VERSION,render,bind,openCampaign,openScope,switchLanguage,editCopy,changeSystem,invalidateAll,approveVariant,approveSet,testDraft,preview,brandQA,setReady,getContext:()=>context,getVariants:()=>JSON.parse(JSON.stringify(variants))};
})(window);
