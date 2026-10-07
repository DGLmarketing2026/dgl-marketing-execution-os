// Creative Intelligence registry (10 dimensions, extensible, honest reference hook), the email
// responsive contract of all six systems, and functional + trackable CTAs.
const assert=require('assert'),fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const window={};const browser={window,URLSearchParams};vm.createContext(browser);
['creative-library-v5','creative-render-v5'].forEach(n=>vm.runInContext(fs.readFileSync('assets/js/'+n+'.js','utf8'),browser));
const L=window.DGL_CREATIVE_LIBRARY_V5,R=window.DGL_CREATIVE_RENDER_V5;
let checks=0;function test(n,fn){fn();checks++;console.log('PASS '+n);}
const DIMS=['CREATIVE_SYSTEM','LAYOUT_FAMILY','CONTENT_HIERARCHY','IMAGE_STRATEGY','CTA_STRATEGY','SERVICE_CONTEXT','CAMPAIGN_OBJECTIVE','AUDIENCE_CONTEXT','LANGUAGE','MOBILE_RULES'];
const COPY={headline:'Your next FTL movement, covered',body:'Capacity this week for dry van and reefer moves.',body2:'Send us the lane and dates.',cta:'SEND A REQUIREMENT',preheader:'Capacity available',subjectA:'Capacity for your next move'};

test('every system has a complete treatment and resolveTreatment returns all 10 dimensions',()=>{
  assert.deepEqual(Array.from(L.CREATIVE_DIMENSIONS),DIMS);
  for(const id of Object.keys(L.CREATIVE_SYSTEMS)){const t=L.CREATIVE_TREATMENTS[id];assert(t,id);for(const k of ['LAYOUT_FAMILY','CONTENT_HIERARCHY','IMAGE_STRATEGY','CTA_STRATEGY','MOBILE_RULES'])assert(t[k],id+' '+k);}
  const r=L.resolveTreatment({objective:'REACTIVATION',service:'Multiservicio',language:'es',audience:{segment:'HA prioritaria'}});
  for(const d of DIMS)assert(d in r,d);
  assert.equal(r.CREATIVE_SYSTEM.id,'editorial-white');assert.equal(r.CAMPAIGN_OBJECTIVE,'Reactivation');assert.equal(r.LANGUAGE,'ES');
  assert.equal(r.CTA_STRATEGY.ctaKey,L.OBJECTIVES.Reactivation.defaultCta);assert.equal(r.CTA_STRATEGY.label,L.CTA[r.CTA_STRATEGY.ctaKey].es);assert(/mailto/.test(r.CTA_STRATEGY.contract.functional));assert.equal(r.AUDIENCE_CONTEXT.segment,'HA prioritaria');
});
test('selection is unchanged: treatment follows the existing selection rules',()=>{
  for(const [ctx,sys] of [[{objective:'QNB'},'executive-minimal'],[{objective:'Cross-Sell'},'service-architecture'],[{objective:'Activation',service:'FTL',angle:'Current Movement'},'split-hero'],[{objective:'Lane Campaign'},'route-intelligence']]){
    assert.equal(L.resolveTreatment(ctx).CREATIVE_SYSTEM.id,sys);assert.equal(L.selectSystem(ctx).systemId,sys);
  }
});
test('registry is extensible and validated',()=>{
  assert.equal(L.registerTreatment('editorial-white',{LAYOUT_FAMILY:'X'}).error,'TREATMENT_INCOMPLETE');
  assert.equal(L.registerTreatment('nope',{LAYOUT_FAMILY:'X',CONTENT_HIERARCHY:['a'],IMAGE_STRATEGY:'i',CTA_STRATEGY:{type:'SINGLE_PRIMARY',defaultCta:'Reply'},MOBILE_RULES:['m']}).error,'UNKNOWN_CREATIVE_SYSTEM');
  assert(L.registerTreatment('case-proof',Object.assign({},L.CREATIVE_TREATMENTS['case-proof'],{LAYOUT_FAMILY:'PROOF_V2'})).ok);
  assert.equal(L.resolveTreatment({objective:'Relationship Renewal'}).LAYOUT_FAMILY,'PROOF_V2');
});
test('reference hook never pretends an analysis that was not supplied',()=>{
  assert.equal(L.registerReference({}).error,'REFERENCE_ID_REQUIRED');
  const p=L.registerReference({referenceId:'EMAIL_AURA_CHATGPT/ref-01.png',source:'Drive',systemId:'editorial-white'});
  assert.equal(p.reference.status,'PENDING_ANALYSIS');assert.deepEqual(L.resolveTreatment({objective:'Reactivation'}).references,[],'pending references influence nothing');
  assert.equal(L.registerReference({referenceId:'r2',analysis:{COLOR_MOOD:'x'}}).error,'UNKNOWN_DIMENSIONS');
  assert.equal(L.registerReference({referenceId:'r3',systemId:'editorial-white',analysis:{LAYOUT_FAMILY:'EDITORIAL_SINGLE_COLUMN'}}).reference.status,'ANALYZED');
  assert.deepEqual(Array.from(L.resolveTreatment({objective:'Reactivation'}).references),['r3']);
});
test('responsive contract: every system ships the mobile stack, fluid hero, wrapping CTA and 28px headline',()=>{
  for(const id of Object.keys(L.CREATIVE_SYSTEMS)){
    const html=R.render({creativeSystem:id,service:'FTL',objective:'Reactivation',language:'EN'},COPY);
    assert(html.includes('<!--dgl-system:'+id+'-->'),id);
    assert(/<meta name="viewport" content="width=device-width/.test(html),id+' viewport');
    const media=(html.match(/@media only screen and \(max-width:620px\)\{([\s\S]*?)\}<\/style>/)||[])[1]||'';
    for(const rule of ['.dgl-col{display:block!important;width:100%!important','.dgl-hero{width:100%!important;height:auto!important','.dgl-h1{font-size:28px!important','.dgl-btn{white-space:normal!important'])assert(media.includes(rule),id+' '+rule);
    assert(!/href="#"/.test(html),id+' no dead CTA');
  }
});
test('every system CTA is functional (mailto/https) and picked up by AURA tracking',()=>{
  const ctx={Utilities:{base64EncodeWebSafe:t=>Buffer.from(Array.isArray(t)?t.map(b=>b&255):String(t)).toString('base64').replace(/\+/g,'-').replace(/\//g,'_'),computeHmacSha256Signature:(v,k)=>Array.from(crypto.createHmac('sha256',k).update(v).digest()),getUuid:()=>'u'},PropertiesService:{getScriptProperties:()=>({getProperty:()=>'secret',setProperty(){}})},encodeURIComponent,String,Array,Object,Number};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync('backend/apps-script-v6/MarketingV6AuraTracking.gs','utf8'),ctx);
  for(const id of Object.keys(L.CREATIVE_SYSTEMS)){
    const html=R.render({creativeSystem:id,service:'FTL',objective:'Reactivation',language:'EN'},COPY),hrefs=ctx.v6AuraTrackingCtaHrefs_(html);
    assert(hrefs.some(h=>/^mailto:[^?]+@dglus\.com\?subject=/.test(h)),id+' functional mailto CTA');
    const tracked=ctx.v6AuraTrackingApply_(html,'JOB:X',"https://script.google.com/macros/s/ABC/exec");
    assert.equal((tracked.match(/aura_t=c/g)||[]).length,hrefs.length,id+' every CTA trackable');
  }
});
console.log(checks+'/'+checks+' creative intelligence checks passed');
