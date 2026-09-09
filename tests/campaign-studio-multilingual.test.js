const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');

function loadEngine(){
  const ctx={window:{}};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root,'assets/js/creative-library-v5.js'),'utf8'),ctx);
  vm.runInContext(fs.readFileSync(path.join(root,'assets/js/copy-engine-v5.js'),'utf8'),ctx);
  return ctx.window.DGL_COPY_ENGINE_V5;
}

const Copy=loadEngine();
const OBJECTIVES=['Retention','Reactivation','Cross-Sell','Quoted Not Booked','Service Campaign','Lane Campaign'];
const LANGUAGES={Spanish:'es',English:'en','Português (Brasil)':'pt'};

// pt-BR must never fall back to the Spanish copy: every objective must
// produce genuine Portuguese content, distinct from its Spanish sibling.
OBJECTIVES.forEach(objective=>{
  const args={objective,service:'FTL',angle:'',qnbWindow:'0-14',lane:'Laredo -> Dallas'};
  const es=Copy.generate({...args,language:'Spanish'});
  const pt=Copy.generate({...args,language:'Português (Brasil)'});
  const en=Copy.generate({...args,language:'English'});
  assert(pt.subjectA&&pt.headline&&pt.body&&pt.cta,`${objective}: pt-BR must produce real subject/headline/body/cta`);
  assert.notEqual(pt.subjectA,es.subjectA,`${objective}: pt-BR subjectA must not equal the Spanish fallback`);
  assert.notEqual(pt.headline,es.headline,`${objective}: pt-BR headline must not equal the Spanish fallback`);
  assert.notEqual(pt.body,es.body,`${objective}: pt-BR body must not equal the Spanish fallback`);
  assert.notEqual(pt.subjectA,en.subjectA,`${objective}: pt-BR subjectA must not equal the English copy`);
  console.log(`PASS: ${objective} produces distinct EN/ES/PT-BR copy (no pt-BR->es fallback)`);
});

// Spot-check genuine Portuguese vocabulary is present (not just Spanish text
// re-labeled as pt) for at least one objective in each copy table.
(function checkGenuinePortugueseVocabulary(){
  const retention=Copy.generate({objective:'Retention',service:'FTL',language:'Português (Brasil)',angle:'Stay Close'});
  assert(/operação|embarque|dispon/i.test(retention.body),'Retention pt-BR body must use real Portuguese vocabulary');
  const crossSell=Copy.generate({objective:'Cross-Sell',service:'FTL',language:'Português (Brasil)',angle:'Additional Capability'});
  assert(/capacidade|embarque/i.test(crossSell.body),'Cross-Sell pt-BR body must use real Portuguese vocabulary');
  const reactivation=Copy.generate({objective:'Reactivation',service:'FTL',language:'Português (Brasil)',angle:'Previous Relationship'});
  assert(/embarque|dispon/i.test(reactivation.body),'Reactivation pt-BR body must use real Portuguese vocabulary');
  const qnb=Copy.generate({objective:'Quoted Not Booked',service:'FTL',language:'Português (Brasil)',qnbWindow:'0-14'});
  assert(/embarque|ativo/i.test(qnb.body),'Quoted Not Booked pt-BR body must use real Portuguese vocabulary');
  console.log('PASS: pt-BR copy uses genuine Portuguese vocabulary across Retention/Cross-Sell/Reactivation/QNB');
})();

// CTA button labels must also be localized per language (not just body copy).
(function checkCtaLocalized(){
  const es=Copy.generate({objective:'Retention',service:'FTL',language:'Spanish',angle:'Stay Close'});
  const pt=Copy.generate({objective:'Retention',service:'FTL',language:'Português (Brasil)',angle:'Stay Close'});
  const en=Copy.generate({objective:'Retention',service:'FTL',language:'English',angle:'Stay Close'});
  assert.notEqual(pt.cta,es.cta,'CTA must be localized for pt-BR, not reused from Spanish');
  assert.notEqual(pt.cta,en.cta,'CTA must be localized for pt-BR, not reused from English');
  console.log('PASS: CTA button label is localized per language');
})();

// Regression: an auto-selected report scope (from Campaign Opportunities ->
// Prepare Campaign) carries source/opportunitySource fields, not the manual
// request shape's sourceType/sourceLabel. The brief-bar "Opportunity Source"
// and "Recipient Status" fields must never render literal "undefined" text
// after a Brief field (language/service/angle/...) changes and re-runs
// updatePreview().
(function checkNoUndefinedInBriefBar(){
  const studioSource=fs.readFileSync(path.join(root,'assets/js/campaign-studio-v5.js'),'utf8');
  assert(/inc\.sourceType\|\|inc\.sourceLabel/.test(studioSource),'updatePreview must check the auto-scope source fields before falling back to sourceType/sourceLabel');
  assert(/inc\.source\|\|inc\.opportunitySource/.test(studioSource),'updatePreview must read source/opportunitySource for auto-selected report scopes');
  assert(/eligibleContacts<1\)audience\.textContent="Contacts pending"/.test(studioSource),'updatePreview must show "Contacts pending" instead of the raw scope/audience id when no contacts are resolved yet');
  console.log('PASS: Campaign Studio brief bar never regresses to literal "undefined" text after a field change');
})();

console.log('Campaign Studio multilingual (EN/ES/PT-BR) copy generation: ALL PASS');
