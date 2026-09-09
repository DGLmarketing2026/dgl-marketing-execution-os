const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const index=read('index.html'),i18nSource=read('assets/js/acquisition-multilingual-v4.js'),visualSource=read('assets/js/acquisition-visual-v3.js');

// --- Script load order: canonical rule from CLAUDE_CONTINUE — the visual
// override layer must load after Automation V2, and the multilingual data
// module must be available before the visual layer consumes it. ---
(function testLoadOrder(){
  const auto=index.indexOf('acquisition-automation-v2.js'),i18n=index.indexOf('acquisition-multilingual-v4.js'),visual=index.indexOf('acquisition-visual-v3.js');
  assert(auto>=0&&i18n>=0&&visual>=0,'all three acquisition scripts must be present in index.html');
  assert(auto<i18n,'acquisition-multilingual-v4.js must load after acquisition-automation-v2.js (visual overrides load after the server-engine layer)');
  assert(i18n<visual,'acquisition-visual-v3.js must load after acquisition-multilingual-v4.js so DGL_ACQUISITION_I18N_V4 exists at module-init time');
  console.log('PASS: acquisition script load order is Automation V2 -> Multilingual V4 -> Visual V3');
})();

// --- Load the real frontend i18n module and verify content end to end ---
function loadI18n(){
  const window={};window.window=window;
  vm.runInNewContext(i18nSource,{window,console});
  return window.DGL_ACQUISITION_I18N_V4;
}
(function testExactHeadlines(){
  const i18n=loadI18n();
  const expected={
    FTL:{en:"U.S. FTL capacity when your operation cannot wait.",es:"Capacidad FTL en EE.UU. cuando su operación no puede esperar.","pt-BR":"Capacidade FTL nos EUA quando sua operação não pode esperar."},
    LTL:{en:"Smaller shipment. Same precision.",es:"Menos volumen. La misma precisión.","pt-BR":"Menor volume. A mesma precisão."},
    Drayage:{en:"From port to the next stop, without losing visibility.",es:"Del puerto al siguiente punto, sin perder visibilidad.","pt-BR":"Do porto ao próximo ponto, sem perder visibilidade."}
  };
  Object.keys(expected).forEach(service=>{
    Object.keys(expected[service]).forEach(lang=>{
      const landing=i18n.landingContent(service,lang),creative=i18n.creativeContent(service,lang);
      assert.equal(landing.headline,expected[service][lang],`${service}/${lang} landing headline must match the canonical copy exactly`);
      assert.equal(creative.headline,expected[service][lang],`${service}/${lang} creative headline must match the canonical copy exactly`);
    });
  });
  console.log('PASS: FTL/LTL/Drayage headlines match the canonical EN/ES/PT-BR copy exactly in both landing and creative content');
})();

(function testThreeRealLanguagesEveryField(){
  const i18n=loadI18n();
  ['FTL','LTL','Drayage'].forEach(service=>{
    const rows=i18n.allLanguages(service,'landing');
    assert.equal(rows.length,3);
    const langs=rows.map(r=>r.language).sort();
    assert.deepEqual(langs,['en','es','pt-BR'].sort());
    rows.forEach(r=>{
      ['headline','subheadline','supportingCopy','cta','seoTitle','seoDescription','slug','confirmation'].forEach(f=>assert(String(r[f]||'').length>0,`${service}/${r.language} landing field ${f} must not be empty`));
      ['firstName','lastName','company','email','country','service','origin','destination','notes','button'].forEach(f=>assert(String(r.formLabels[f]||'').length>0,`${service}/${r.language} form label ${f} must not be empty`));
    });
    const creatives=i18n.allLanguages(service,'creative');
    creatives.forEach(r=>{
      ['headline','supportingLine','cta','socialPost','description'].forEach(f=>assert(String(r[f]||'').length>0,`${service}/${r.language} creative field ${f} must not be empty`));
      assert(Array.isArray(r.hashtags)&&r.hashtags.length>0,`${service}/${r.language} creative must include hashtags`);
    });
  });
  console.log('PASS: every service generates all 3 languages with every required landing and creative field populated');
})();

(function testMarketRouting(){
  const i18n=loadI18n();
  assert.equal(i18n.marketDefaultLanguage('USA'),'en');
  assert.equal(i18n.marketDefaultLanguage('International'),'en');
  assert.equal(i18n.marketDefaultLanguage('LATAM'),'es');
  assert.equal(i18n.marketDefaultLanguage('Mexico'),'es');
  assert.equal(i18n.marketDefaultLanguage('Brazil'),'pt-BR');
  assert.equal(i18n.marketDefaultLanguage('Brasil'),'pt-BR');
  console.log('PASS: frontend market routing (USA/International->EN, LATAM->ES, Brazil->PT-BR)');
})();

(function testNoBannedAbsoluteClaims(){
  const banned=[/on time, every lane/i,/a tiempo, en cada ruta/i,/no prazo, em cada rota/i];
  banned.forEach(re=>assert(!re.test(i18nSource),`banned absolute-claim phrase ${re} found in acquisition-multilingual-v4.js`));
  console.log('PASS: no absolute capacity/time-guarantee phrases in the frontend multilingual module');
})();

(function testBrazilianTerminology(){
  const i18n=loadI18n();
  const ftlPt=i18n.landingContent('FTL','pt-BR');
  assert(/p[eé]s/i.test(ftlPt.subheadline),'pt-BR FTL copy should use Brazilian "pés" terminology for 53\' equipment, not a literal foot-mark');
  assert(!/53'/.test(ftlPt.subheadline)&&!/53'/.test(ftlPt.supportingCopy),'pt-BR FTL copy must not carry the literal 53\' notation');
  console.log('PASS: pt-BR FTL copy uses natural Brazilian trucking terminology ("pés") instead of a literal translation');
})();

// --- Visual design system mapping: FTL/LTL/Drayage -> real repo assets ---
(function testVisualDesignMapping(){
  const i18n=loadI18n();
  const byId=Object.fromEntries(i18n.SERVICES.map(s=>[s.id,s]));
  assert.equal(byId.FTL.system,'SPLIT FREIGHT');assert.equal(byId.FTL.asset,'assets/creative/dgl-ftl-truck.webp');
  assert.equal(byId.LTL.system,'EDITORIAL WHITE');assert.equal(byId.LTL.asset,'assets/creative/dgl-ltl-terminal.png');
  assert.equal(byId.Drayage.system,'ROUTE INTELLIGENCE');assert.equal(byId.Drayage.asset,'assets/creative/dgl-container-transload.jpg');
  ['assets/creative/dgl-ftl-truck.webp','assets/creative/dgl-ltl-terminal.png','assets/creative/dgl-container-transload.jpg'].forEach(p=>assert(fs.existsSync(path.join(root,p)),`referenced creative asset must exist on disk: ${p}`));
  console.log('PASS: FTL/LTL/Drayage map to their real design system and a real, existing repository asset');
})();

// --- No invented New Business owner in the visual layer ---
(function testNoInventedOwnerFrontend(){
  assert(visualSource.includes('PENDING SALESFORCE ASSIGNMENT'),'visual layer must show a pending state instead of inventing an owner');
  assert(!/newBusinessOwner\s*:\s*['"][A-Z][a-z]+ [A-Z][a-z]+['"]/.test(visualSource),'no hardcoded person name must ever be assigned as newBusinessOwner');
  console.log('PASS: acquisition visual layer never invents a New Business owner name');
})();

// --- No PII in the frontend acquisition modules ---
(function testNoPiiFrontend(){
  [i18nSource,visualSource].forEach((src,i)=>{
    assert(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(src),`frontend acquisition module ${i} must not contain email addresses`);
  });
  console.log('PASS: no PII in the frontend acquisition multilingual/visual modules');
})();

console.log('Acquisition frontend multilingual: ALL PASS');
