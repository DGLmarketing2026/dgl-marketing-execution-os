const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');

// Regression guard for the Campana A Activation misclassification fix: every
// frontend module that resolves campaign copy/creative/sequence/playbook by
// "objective" must have a DEDICATED Activation branch and must never silently
// fall through to Reactivation or Retention (the exact bug this PR fixes).

function loadInWindow(files){
  const ctx={window:{},document:{addEventListener:()=>{},getElementById:()=>null,querySelectorAll:()=>[]}};
  ctx.window.document=ctx.document;
  vm.createContext(ctx);
  files.forEach(f=>vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx));
  return ctx.window;
}

// 1. creative-library-v5.js: Activation objective is a real, dedicated entry.
(function(){
  const w=loadInWindow(['assets/js/creative-library-v5.js']);
  const Lib=w.DGL_CREATIVE_LIBRARY_V5;
  const act=Lib.OBJECTIVES.Activation;
  assert(act,'OBJECTIVES.Activation must exist');
  assert.strictEqual(act.recommendedSystem,'editorial-white','Activation recommendedSystem must be editorial-white');
  assert.strictEqual(act.defaultAngle,'Current Movement','Activation defaultAngle must be Current Movement');
  assert.strictEqual(JSON.stringify(act.angles),JSON.stringify(['Current Movement']),'Activation has exactly one approved angle: Current Movement');
  assert.strictEqual(act.defaultCta,'Generate Quote','Activation defaultCta must be Generate Quote');
  assert(Lib.CREATIVE_SYSTEMS['editorial-white'].recommendedFor.includes('Activation'),'editorial-white must list Activation in recommendedFor');
  const asset=Lib.resolveAsset({objective:'Activation',service:'FTL',angle:'Current Movement'});
  assert(asset,'resolveAsset(Activation) must return a real asset path, not fall through silently to an unrelated branch');
  console.log('PASS: creative-library-v5.js has a dedicated Activation objective + asset resolution');
})();

// 2. copy-engine-v5.js: Activation copy is its own block, never falls back
//    to Reactivation/Retention, and matches the approved backend text.
(function(){
  const w=loadInWindow(['assets/js/creative-library-v5.js','assets/js/copy-engine-v5.js']);
  const Copy=w.DGL_COPY_ENGINE_V5;
  const act=Copy.generate({objective:'Activation',service:'FTL',language:'Spanish'});
  const reactivation=Copy.generate({objective:'Reactivation',service:'FTL',language:'Spanish',angle:'Previous Relationship'});
  assert.notStrictEqual(act.subjectA,reactivation.subjectA,'Activation must NOT fall back to Reactivation copy');
  assert.strictEqual(act.subjectA,'{{firstName}}, ¿tiene un movimiento {{service}} en puerta?','Activation ES subjectA must match the approved backend text exactly (merge tags resolved at send time)');
  assert.strictEqual(act.headline,'¿QUÉ MOVIMIENTO TIENE EN PUERTA?','Activation ES headline must match the approved backend text exactly');
  assert.strictEqual(act.cta,'ENVIAR MOVIMIENTO','Activation defaultCta (Generate Quote) must resolve to the ES CTA label');
  const en=Copy.generate({objective:'Activation',service:'FTL',language:'English'});
  const pt=Copy.generate({objective:'Activation',service:'FTL',language:'Português (Brasil)'});
  assert.strictEqual(en.subjectA,'{{firstName}}, any {{service}} shipments coming up?','Activation EN subjectA must match approved backend text');
  assert.strictEqual(pt.subjectA,'{{firstName}}, tem algum embarque de {{service}} previsto?','Activation PT subjectA must match approved backend text');
  console.log('PASS: copy-engine-v5.js has a dedicated ACTIVATION block matching backend copy exactly, no fallback');
})();

// 3. campaign-sequences-v4.js: Activation has its own sequence.
(function(){
  const w=loadInWindow(['assets/js/campaign-sequences-v4.js']);
  const Seq=w.DGL_CAMPAIGN_SEQUENCES_V4;
  const act=Seq.getSequence('Activation','FTL','Spanish');
  const reactivation=Seq.getSequence('Reactivation','FTL','Spanish');
  assert.notStrictEqual(JSON.stringify(act),JSON.stringify(reactivation),'Activation sequence must not fall back to Reactivation sequence');
  assert(act.length>=3,'Activation sequence must define real touches');
  console.log('PASS: campaign-sequences-v4.js has a dedicated Activation sequence, no fallback');
})();

// 4. marketing-playbooks-v55.js: ACTIVATION_ACCOUNT is wired via the resolver.
(function(){
  const w=loadInWindow(['assets/js/marketing-playbooks-v55.js']);
  const PB=w.DGL_MARKETING_PLAYBOOKS;
  const pb=PB.getPlaybookForRequest({objective:'Activation'});
  assert(pb,'getPlaybookForRequest(Activation) must resolve a playbook');
  assert.strictEqual(pb.id,'ACTIVATION_ACCOUNT','Activation must resolve to the dedicated ACTIVATION_ACCOUNT playbook');
  assert.strictEqual(pb.messageAngle,'Current Movement');
  const strat=PB.resolveStrategy({objective:'Activation',service:'FTL',scopeId:'SCOPE-1'});
  assert.strictEqual(strat.strategy.playbookId,'ACTIVATION_ACCOUNT','resolveStrategy(Activation) must use ACTIVATION_ACCOUNT, not fall back');
  console.log('PASS: marketing-playbooks-v55.js resolves ACTIVATION -> ACTIVATION_ACCOUNT');
})();

// 5. campaign-studio-v5.js: deriveCampaignName() recognizes Activation
//    (does not silently fall through to the "Reactivation ${service}" default).
(function(){
  const w=loadInWindow(['assets/js/campaign-studio-v5.js']);
  const Studio=w.DGL_CAMPAIGN_STUDIO_V5;
  const name=Studio.deriveCampaignName({objective:'Activation',service:'FTL',angle:'Current Movement'});
  assert(/^Activation/.test(name),`deriveCampaignName(Activation) must start with "Activation", got "${name}"`);
  assert(!/^Reactivation/.test(name),'deriveCampaignName(Activation) must NOT fall back to the Reactivation default name');
  console.log('PASS: campaign-studio-v5.js deriveCampaignName() has a dedicated Activation branch');
})();

console.log('ALL v5-activation-frontend checks passed');
