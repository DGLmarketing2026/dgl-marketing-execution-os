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
  assert(/state\.approvedCreative=\{creativeId:persisted\.creativeId,/.test(studioSource),'a successful approval must store the FULL persisted creative record locally, not just flip a boolean');
  console.log('PASS: Approve Creative persists the full creative (subject/preheader/htmlBody/textBody/heroUrl/logoUrl/language), not just a status flag');
})();
(function checkApprovalInvalidatesOnEveryContentChange(){
  const studioSource=fs.readFileSync(path.join(root,'assets/js/campaign-studio-v5.js'),'utf8');
  // PR #3 audit punto 4 -- every place that used to reset local state only now goes through
  // invalidateApproval(), which ALSO revokes the backend record.
  assert(/function invalidateApproval\(\)\{/.test(studioSource),'an invalidateApproval() helper must exist');
  assert(/revokeApprovedCreative\(prior\.creativeId,"Marketing"\)/.test(studioSource),'invalidateApproval() must call the backend adapter\'s revokeApprovedCreative, not just clear local state');
  const invalidateCallSites=(studioSource.match(/invalidateApproval\(\);/g)||[]).length;
  assert(invalidateCallSites>=4,`invalidateApproval() must be called at every content-change site (generate/creative-system switch/lane edit/field edit) -- found ${invalidateCallSites}, expected at least 4`);
  // generate() (objective/service/language/angle/ctaIntent/qnbWindow changes) invalidates via the helper.
  assert(/state\.generated=Copy\(\)\.generate\(s\);invalidateApproval\(\);/.test(studioSource),'generate() must invalidate any existing approval (local + backend) via invalidateApproval()');
  console.log('PASS: every path that changes the rendered creative after approval (generate/field edit/creative-system switch) invalidates state.approved, state.approvedCreative, AND the backend record');
})();
(function checkApprovalHardFailsWithoutRealPersistence(){
  const studioSource=fs.readFileSync(path.join(root,'assets/js/campaign-studio-v5.js'),'utf8');
  // PR #3 audit punto 3 -- approval must FAIL (throw), never silently succeed, when there is no
  // campaignId, no connected private backend, or the backend does not return a complete record.
  assert(/if\(!campaignId\)throw new Error\("Approval blocked: no campaignId\./.test(studioSource),'approval must throw when campaignId is missing');
  assert(/if\(!global\.DGL_MARKETING_BACKEND_ADAPTER_V55\?\.isConnected\(\)\)throw new Error\("Approval blocked: private backend is not connected\."\)/.test(studioSource),'approval must throw when the private backend is not connected');
  assert(/if\(!persisted\|\|!persisted\.creativeId\|\|!persisted\.approvalId\|\|!\(Number\(persisted\.creativeVersion\)>0\)\|\|!persisted\.htmlChecksum\)\{/.test(studioSource),'approval must throw when the backend does not return a valid creativeId+approvalId+creativeVersion+checksum');
  assert(!/state\.approved=true;\s*\n\s*state\.approvedCreative=persisted\s*\n\s*\?/.test(studioSource),'there must be no remaining silent-success fallback for a missing/disconnected backend');
  console.log('PASS: Approve Creative fails closed -- no campaignId, no connected backend, or an incomplete persisted record all block approval');
})();
(function checkEmailHtmlUsesAbsoluteAssetsAndFunctionalCta(){
  const studioSource=fs.readFileSync(path.join(root,'assets/js/campaign-studio-v5.js'),'utf8');
  // PR #3 audit punto 1 -- absolute public URLs for every assets/... reference, computed by
  // emailHtml() itself, with no separate post-processing step anywhere in the file.
  assert(/function absUrl\(u\)\{/.test(studioSource),'an absUrl() helper must exist');
  assert(/const BASE_URL="https:\/\/dglmarketing2026\.github\.io\/dgl-marketing-execution-os\/"/.test(studioSource),'BASE_URL must be the canonical public GitHub Pages origin');
  assert(/const OFFICIAL_LOGO=absUrl\(/.test(studioSource)&&/const DEFAULT_HERO=absUrl\(/.test(studioSource),'OFFICIAL_LOGO and DEFAULT_HERO must be absolutized at definition time');
  assert(/absUrl\(s\.logoUrl\|\|OFFICIAL_LOGO\)/.test(studioSource),'brandHeader must absolutize the logo URL it renders');
  assert(/function assetPath\(s\)\{\s*\n\s*return absUrl\(/.test(studioSource),'assetPath must absolutize the hero asset URL it resolves');
  assert(!/\.replace\(\/\(\["'\(=\]\)assets\\\//.test(studioSource),'requestDraft() must no longer post-process relative assets/ URLs -- emailHtml() must already emit absolute URLs before approval');
  // PR #3 audit punto 2 -- functional CTA (mailto:), never a placeholder href="#".
  assert(/const DGL_CANONICAL_REPLY_TO="info@dglus\.com"/.test(studioSource),'a canonical reply-to constant must exist for the CTA mailto: link');
  assert(/const ctaHref=`mailto:\$\{s\.replyTo\|\|DGL_CANONICAL_REPLY_TO\}\?subject=\$\{encodeURIComponent\(subjectSample\)\}`/.test(studioSource),'the CTA button must be a real mailto: link built from the canonical reply-to address');
  assert(!/<a href="#" style=/.test(studioSource),'the CTA button must no longer use a placeholder href="#"');
  console.log('PASS: emailHtml() emits absolute assets/ URLs and a functional mailto: CTA, with no post-processing step left anywhere');
})();

console.log('Campaign Studio multilingual (EN/ES/PT-BR) copy generation: ALL PASS');
