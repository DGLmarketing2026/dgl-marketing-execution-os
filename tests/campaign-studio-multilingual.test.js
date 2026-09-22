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

// Iniciativa 2 -- Campaign Studio como unica fuente canonica del email. Static-source checks
// (same convention as checkNoUndefinedInBriefBar above) that the Approve Creative action
// persists the FULL creative content (never just a status flag), and that every path which
// changes the rendered creative after an approval -- a direct field edit, a creative-system
// switch, or generate() itself -- resets state.approved/state.approvedCreative so a stale
// approval can never be left pointing at content Marketing no longer sees on screen.
(function checkApproveCreativePersistsFullContent(){
  const studioSource=fs.readFileSync(path.join(root,'assets/js/campaign-studio-v5.js'),'utf8');
  assert(/approveCreative\(campaignId,\{/.test(studioSource),'the Approve Creative handler must call the backend adapter\'s approveCreative, not just recordApproval');
  assert(/htmlBody:preview\.html\|\|""/.test(studioSource),'approveCreative must be sent preview.html verbatim -- Campaign Studio\'s own getPreview().html, never a re-render');
  assert(/state\.approvedCreative=persisted/.test(studioSource),'a successful approval must store the persisted creative record locally, not just flip a boolean');
  console.log('PASS: Approve Creative persists the full creative (subject/preheader/htmlBody/textBody/heroUrl/logoUrl/language), not just a status flag');
})();
(function checkApprovalInvalidatesOnEveryContentChange(){
  const studioSource=fs.readFileSync(path.join(root,'assets/js/campaign-studio-v5.js'),'utf8');
  // generate() (objective/service/language/angle/ctaIntent/qnbWindow changes) already resets both.
  assert(/state\.generated=Copy\(\)\.generate\(s\);state\.approved=false;state\.approvedCreative=null;/.test(studioSource),'generate() must reset both approved and approvedCreative together');
  // A direct field edit (subject/body/CTA/hero/logo/lane) after approval must invalidate it.
  assert(/if\(state\.approved\)\{state\.approved=false;state\.approvedCreative=null;\}\s*\n\s*updatePreview\(\);updateQA\(\)\s*\n\s*\}/.test(studioSource),'a direct content-field edit must invalidate an existing approval before updating the preview');
  // Switching the creative/layout system after approval must also invalidate it.
  assert(/if\(state\.approved\)\{state\.approved=false;state\.approvedCreative=null;\}\s*\n\s*updatePreview\(\);updateQA\(\);return\}/.test(studioSource),'switching the creative system after approval must invalidate it, the same as any other content change');
  console.log('PASS: every path that changes the rendered creative after approval (generate/field edit/creative-system switch) invalidates state.approved and state.approvedCreative');
})();

console.log('Campaign Studio multilingual (EN/ES/PT-BR) copy generation: ALL PASS');
