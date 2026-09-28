// PR #9 visual QA regression (browser-discovered defect #1): tests/campaign-studio-multilingual
// .test.js already covers DGL_COPY_ENGINE_V5 in isolation, loading ONLY copy-engine-v5.js and
// calling generate() with full language names ('Spanish'/'English'/'Português (Brasil)'). That
// missed a real defect because the REAL app (index.html) loads a SECOND script after it,
// copy-experience-v1.js, which reassigns DGL_COPY_ENGINE_V5.generate in place -- and the
// governed Campaign Studio (campaign-studio-v6.js) calls that generate() with the bare
// LANGUAGES codes "ES"/"EN"/"PT" (see campaign-studio-v6.js's top-level LANGUAGES constant),
// never the full names. copy-experience-v1.js's own language mapper only recognized "pt-br" or
// any string containing "portugu" -- bare "PT"/"pt" fell through to the Spanish default, so
// every Portuguese Campaign Studio variant silently rendered as Spanish. This test loads the
// exact real script chain, in the real load order (creative-library-v5, copy-engine-v5,
// copy-experience-v1 -- see index.html), and drives generate() the way campaign-studio-v6.js
// actually does, so a regression of either script overriding language recognition again is
// caught here without needing a real browser.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');

function loadRealAppCopyLayer(){
  const fakeDocument={
    getElementById:()=>null,
    addEventListener:()=>{},
    documentElement:{}
  };
  const ctx={
    window:{},
    document:fakeDocument,
    MutationObserver:class{constructor(fn){this.fn=fn;}observe(){}disconnect(){}},
    sessionStorage:{getItem:()=>null,setItem:()=>{}}
  };
  ctx.window.document=ctx.document;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root,'assets/js/creative-library-v5.js'),'utf8'),ctx,{filename:'creative-library-v5.js'});
  vm.runInContext(fs.readFileSync(path.join(root,'assets/js/copy-engine-v5.js'),'utf8'),ctx,{filename:'copy-engine-v5.js'});
  vm.runInContext(fs.readFileSync(path.join(root,'assets/js/copy-experience-v1.js'),'utf8'),ctx,{filename:'copy-experience-v1.js'});
  return ctx.window.DGL_COPY_ENGINE_V5;
}

const Copy=loadRealAppCopyLayer();

// The exact call shape campaign-studio-v6.js's createModel() makes: bare "ES"/"EN"/"PT" codes,
// Activation objective (Campaign A's only objective), 'Current Movement' angle.
(function bareLanguageCodesProduceGenuineTrilingualCopyTest(){
  const args={objective:'Activation',service:'Multiservicio',angle:'Current Movement',ctaIntent:'Send Requirement'};
  const es=Copy.generate({...args,language:'ES'});
  const en=Copy.generate({...args,language:'EN'});
  const pt=Copy.generate({...args,language:'PT'});
  assert(pt.subjectA&&pt.headline&&pt.body&&pt.cta,'bare "PT" must produce real subject/headline/body/cta');
  assert.equal(pt.languageCode,'pt-BR','bare "PT" must resolve to the pt-BR copy table, not silently default to es');
  assert.notEqual(pt.subjectA,es.subjectA,'bare "PT" subjectA must not equal the Spanish fallback');
  assert.notEqual(pt.headline,es.headline,'bare "PT" headline must not equal the Spanish fallback');
  assert.notEqual(pt.body,es.body,'bare "PT" body must not equal the Spanish fallback');
  assert.notEqual(pt.subjectA,en.subjectA,'bare "PT" subjectA must not equal the English copy');
  assert(/embarque|rota|dispon|necessidade/i.test(pt.body),'bare "PT" body must use real Portuguese vocabulary, not Spanish text mislabeled as PT');
  assert.equal(es.languageCode,'es','bare "ES" must still resolve to the Spanish copy table');
  assert.equal(en.languageCode,'en','bare "EN" must still resolve to the English copy table');
  console.log('PASS: campaign-studio-v6 language layering -- bare ES/EN/PT codes through the real copy-engine-v5 + copy-experience-v1 chain each produce genuine, distinct language content (regression test for the PT->ES visual QA defect)');
})();

// Lowercase variants (defensive: campaign-studio-v6.js always sends uppercase today, but the
// language() mapper itself lowercases its input, so lowercase must resolve identically).
(function lowercaseLanguageCodesAlsoResolveCorrectlyTest(){
  const args={objective:'Activation',service:'Multiservicio',angle:'Current Movement',ctaIntent:'Send Requirement'};
  const pt=Copy.generate({...args,language:'pt'});
  assert.equal(pt.languageCode,'pt-BR','lowercase "pt" must also resolve to pt-BR, not the Spanish default');
  console.log('PASS: lowercase "pt" language code also resolves to genuine Portuguese copy');
})();

// Campaign A regression (browser-discovered 2026-09-28): copy-experience-v1.js's copyFor() had no
// Activation branch, so Activation fell through to the Reactivation template and injected the
// service name ("Multiservicio") into every ES/EN/PT field -- copy the governed backend rejects for
// Campaign A (ACTIVATION_COPY_INVALID in v6AuraApproveCreative_ and v6CampaignStudioTestDraft_).
// Activation must come unchanged from copy-engine-v5's service-neutral ACTIVATION table.
(function activationCopyIsCanonicalAndBackendValidTest(){
  const engineOnly=(()=>{
    const ctx={window:{}};vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(root,'assets/js/creative-library-v5.js'),'utf8'),ctx);
    vm.runInContext(fs.readFileSync(path.join(root,'assets/js/copy-engine-v5.js'),'utf8'),ctx);
    return ctx.window.DGL_COPY_ENGINE_V5;
  })();
  // Same pattern the backend applies to Campaign A drafts and approvals.
  const BACKEND_INVALID=/stay close|staying close|seguimos cerca|relationship continuity|multiservicio|\{\{service\}\}/i;
  const args={objective:'Activation',service:'Multiservicio',angle:'Current Movement',ctaIntent:'Send Requirement'};
  const expectedCode={ES:'es',EN:'en',PT:'pt-BR'};
  for(const language of ['ES','EN','PT']){
    const layered=Copy.generate({...args,language}),canonical=engineOnly.generate({...args,language});
    for(const field of ['subjectA','subjectB','preheader','headline','body','body2','cta'])
      assert.equal(layered[field],canonical[field],language+' '+field+' must equal the canonical copy-engine-v5 Activation copy');
    assert(!BACKEND_INVALID.test(Object.values(layered).join(' ')),language+' Activation copy must pass the governed backend copy rules (no service injection)');
    assert.equal(layered.languageCode,expectedCode[language]);
  }
  assert.equal(Copy.generate({...args,language:'EN'}).subjectA,'{{firstName}}, any ground moves coming up?');
  // Other families still use copy-experience-v1's own templates.
  assert.notEqual(Copy.generate({objective:'Reactivation',service:'FTL',angle:'Previous Relationship',language:'EN'}).subjectA,
    engineOnly.generate({objective:'Reactivation',service:'FTL',angle:'Previous Relationship',language:'EN'}).subjectA);
  console.log('PASS: Activation copy through the real copy-experience-v1 chain equals the canonical service-neutral copy and passes the Campaign A backend copy rules');
})();
