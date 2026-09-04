// AURA Retention Bridge.
//
// Named contract surface between AM Intelligence-gated signal detection
// (MarketingV6ReportIngestion.gs) and the Marketing OS campaign/response engines.
// Every function here delegates to an already-existing engine; none introduces a new
// suppression rule, threshold, or table. This file exists so the canonical architecture
// (NOVA/SALESFORCE -> AM PLATFORM / AM INTELLIGENCE -> AURA -> MARKETING OS -> ... )
// has one place with the exact route names AURA calls, instead of scattering direct
// calls to internal engine functions across callers.

function v6AuraText_(v){return String(v==null?'':v).trim();}

// Same slug rule as the frontend's scopeId() in assets/js/lifecycle-modules-v6.js --
// duplicated (not imported, .gs/.js cannot share a module) but kept byte-for-byte
// equivalent so a scopeId computed here and one computed in the browser for the same
// group always match. Do not diverge this from the frontend without updating both.
function v6AuraSlug_(v){
  return String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}
function v6AuraScopeId_(amOwner,opportunityType,service,window,reasonCategory){
  return 'SCOPE-'+v6AuraSlug_(amOwner||'UNASSIGNED')+'-'+v6AuraSlug_(opportunityType||'')+'-'+v6AuraSlug_(service||'MULTISERVICIO')+'-'+v6AuraSlug_(window||'')+'-'+v6AuraSlug_(reasonCategory||'');
}

// --- Automatic scope build for Retention ------------------------------------
// Additive only: reads DETECTED Retention rows from MKT_OPPORTUNITIES (already written
// by v6RefreshOpportunitiesFromReports_), groups them by (amOwner, service) -- Retention
// rows never carry a window/reasonCategory, same as today's frontend grouping -- and
// calls v6AuraEnsureCampaignScope_ per group. Never touches QNB/Reactivation/Cross-Sell/
// Nurture rows (filtered out by opportunityType) and can never collide with their scope
// rows (a Retention scopeId always contains the RETENTION segment).
function v6AuraAutoBuildRetentionScopes_(){
  var rows=v6Rows_('MKT_OPPORTUNITIES').filter(function(r){
    return v6AuraText_(r.opportunityType)==='Retention'&&v6AuraText_(r.eligibilityStatus).toUpperCase()==='DETECTED';
  });
  var groups={};
  rows.forEach(function(r){
    var owner=v6AuraText_(r.amOwner)||'Unassigned',service=v6AuraText_(r.service)||'Multiservicio';
    var scopeId=v6AuraScopeId_(owner,'RETENTION',service,'','');
    (groups[scopeId]=groups[scopeId]||[]).push(v6AuraText_(r.accountId));
  });
  var scopesBuilt=0,accountsScoped=0;
  Object.keys(groups).forEach(function(scopeId){
    var accountIds=groups[scopeId].filter(Boolean);
    if(!accountIds.length)return;
    v6AuraEnsureCampaignScope_({scopeId:scopeId,opportunityType:'Retention',campaignType:'Retention',accountIds:accountIds});
    scopesBuilt++;accountsScoped+=accountIds.length;
  });
  return {status:'SCOPES_READY',scopesBuilt:scopesBuilt,accountsScoped:accountsScoped};
}

// --- Evaluate Retention ---------------------------------------------------
// Reuses the full opportunity refresh: Retention detection is part of the same unified
// detect pass as QNB/Reactivation/Cross-Sell/Nurture (v6RefreshOpportunitiesFromReports_),
// not a separate cycle -- a second, Retention-only refresh would risk a competing
// schedule and duplicate writes to MKT_OPPORTUNITIES. Immediately follows detection with
// v6AuraAutoBuildRetentionScopes_ so a scheduled call to this single function performs
// detect -> suppress -> build scope automatically, with no manual account list at any
// point. Returns Retention-scoped aggregates only (no accountId/accountName), matching
// the safe-aggregate pattern already used by v6SafeOpportunityResponse_ /
// runV6BackendSmokeTest.
function v6AuraEvaluateRetention_(){
  var refresh=v6RefreshOpportunitiesFromReports_();
  var rows=v6Rows_('MKT_OPPORTUNITIES').filter(function(r){return v6AuraText_(r.opportunityType)==='Retention';});
  var detected=0,suppressed=0,reviewRequired=0,byReason={};
  rows.forEach(function(r){
    if(v6AuraText_(r.eligibilityStatus).toUpperCase()==='DETECTED'){detected++;return;}
    suppressed++;
    var reason=v6AuraText_(r.suppressionReason)||'UNSPECIFIED';
    byReason[reason]=(byReason[reason]||0)+1;
    if(reason==='AM ACTIVITY REVIEW REQUIRED'||reason==='AM CONTEXT REQUIRED')reviewRequired++;
  });
  var scopes=v6AuraAutoBuildRetentionScopes_();
  return {
    status:'RETENTION_EVALUATED',detected:detected,suppressed:suppressed,reviewRequired:reviewRequired,
    byReason:byReason,retentionCuentasJoinCoverage:refresh.retentionCuentasJoinCoverage,syncedAt:refresh.syncedAt,
    scopesBuilt:scopes.scopesBuilt,accountsScoped:scopes.accountsScoped
  };
}

// --- Query status ----------------------------------------------------------
// Read-only, safe-aggregate consolidated status for one account: pipeline stage,
// latest Retention signal (if any), and audience/recipient status (if a campaign is
// already linked). Never returns accountName/email/phone or any other contact PII.
function v6AuraStatus_(payload){
  var accountId=v6AuraText_((payload||{}).accountId);
  if(!accountId)throw new Error('accountId REQUIRED');
  var pipeline=v6Rows_('MKT_ACCOUNT_PIPELINE').filter(function(r){return v6AuraText_(r.accountId)===accountId;})[0]||null;
  var retentionOpp=v6Rows_('MKT_OPPORTUNITIES').filter(function(r){
    return v6AuraText_(r.accountId)===accountId&&v6AuraText_(r.opportunityType)==='Retention';
  })[0]||null;
  var audience=null;
  if(pipeline&&v6AuraText_(pipeline.campaignId)){
    audience=v6AudienceStatus_({campaignId:pipeline.campaignId});
  }
  return {
    accountId:accountId,
    currentStage:pipeline?v6AuraText_(pipeline.currentStage):'NO PIPELINE RECORD',
    nextAction:pipeline?v6AuraText_(pipeline.nextAction):'',
    handoffStatus:pipeline?v6AuraText_(pipeline.handoffStatus):'',
    campaignId:pipeline?v6AuraText_(pipeline.campaignId):'',
    retentionEligibilityStatus:retentionOpp?v6AuraText_(retentionOpp.eligibilityStatus):'NO RETENTION SIGNAL',
    retentionSuppressionReason:retentionOpp?v6AuraText_(retentionOpp.suppressionReason):'',
    audienceStatus:audience?audience.audienceStatus:null,
    eligibleContactCount:audience?audience.eligibleContactCount:null
  };
}

// --- Create/reuse campaign scope --------------------------------------------
// Populates MKT_CAMPAIGN_SCOPES / MKT_SCOPE_ACCOUNTS (schema already defined in
// MarketingV6SchemaMigration.gs, already read by v6ResolveRecipients_ via
// v6RecipientCampaignContext_) for a given scopeId + explicit list of eligible
// accountIds. Idempotent: re-running with the same scopeId/accountId merges, never
// duplicates (v6UpsertByKey_). campaignId is left blank unless the caller already has
// one -- assigning a campaignId is the private backend's job (createRequest/
// createCampaign in the private V5.5 adapter, not part of this public source pack);
// v6RecipientCampaignContext_ can still resolve this scope by scopeId once a
// MKT_CAMPAIGNS row referencing the same scopeId exists.
function v6AuraEnsureCampaignScope_(payload){
  var p=payload||{},scopeId=v6AuraText_(p.scopeId);
  if(!scopeId)throw new Error('scopeId REQUIRED');
  var accountIds=(Array.isArray(p.accountIds)?p.accountIds:[]).map(v6AuraText_).filter(Boolean);
  var now=new Date().toISOString(),campaignId=v6AuraText_(p.campaignId);
  v6RequireContactRecipientHeaders_('MKT_CAMPAIGN_SCOPES');
  v6RequireContactRecipientHeaders_('MKT_SCOPE_ACCOUNTS');
  v6UpsertByKey_('MKT_CAMPAIGN_SCOPES',['scopeId'],{
    scopeId:scopeId,audienceId:scopeId,campaignId:campaignId,
    campaignType:v6AuraText_(p.campaignType||p.opportunityType||'Retention'),
    opportunityType:v6AuraText_(p.opportunityType||'Retention'),updatedAt:now
  });
  accountIds.forEach(function(accountId){
    v6UpsertByKey_('MKT_SCOPE_ACCOUNTS',['scopeId','accountId'],{
      scopeId:scopeId,audienceId:scopeId,campaignId:campaignId,accountId:accountId,
      eligibilityStatus:'ELIGIBLE',updatedAt:now
    });
  });
  return {status:'SCOPE_READY',scopeId:scopeId,campaignId:campaignId,accountsWritten:accountIds.length};
}

// --- Account Stop ------------------------------------------------------------
// Thin, explicitly-named wrapper over the existing pipeline stage machine
// (v6UpsertPipelineStage_ / MarketingV6Pipeline.gs). Does not introduce a new stage or
// suppression mechanism. Note: if the account has already advanced past the point
// where CLOSED / SUPPRESSED would rank higher (e.g. already QUOTED or LOAD /
// REACTIVATED), v6UpsertPipelineStage_'s own preventDowngrade guard keeps the more
// advanced commercial stage intact -- a Marketing stop must not erase evidence that a
// Quote/Load already happened. nextAction and handoffStatus are still updated in that
// case, so the stop/handoff intent is never lost even when the stage itself does not
// move backward.
function v6AuraCreateAccountStop_(payload){
  var p=payload||{},accountId=v6AuraText_(p.accountId);
  if(!accountId)throw new Error('accountId REQUIRED');
  var existing=v6Rows_('MKT_ACCOUNT_PIPELINE').filter(function(r){return v6AuraText_(r.accountId)===accountId;})[0]||{};
  return v6UpsertPipelineStage_({
    accountId:accountId,
    accountName:p.accountName||existing.accountName||'',
    amOwner:p.amOwner||existing.amOwner||'',
    opportunityType:p.opportunityType||existing.opportunityType||'',
    service:p.service||existing.service||'',
    campaignId:p.campaignId||existing.campaignId||'',
    executionId:p.executionId||existing.executionId||'',
    hardSuppression:true,
    nextAction:'ACCOUNT STOP: '+(v6AuraText_(p.reason)||'UNSPECIFIED'),
    handoffStatus:'PENDING'
  });
}

// --- AM Handoff ---------------------------------------------------------------
// Explicitly-named wrapper that records/updates a handoff without forcing any stage
// transition -- it reads the account's current stage first and passes it straight
// through, so an AM Handoff call never resets an already-advanced pipeline stage back
// to OPPORTUNITY DETECTED (the default v6StageFromSignal_ would fall back to if no
// currentStage were supplied). Requires an existing pipeline record: a handoff with no
// pipeline context to attach to is refused rather than fabricated.
function v6AuraCreateAmHandoff_(payload){
  var p=payload||{},accountId=v6AuraText_(p.accountId);
  if(!accountId)throw new Error('accountId REQUIRED');
  var existing=v6Rows_('MKT_ACCOUNT_PIPELINE').filter(function(r){return v6AuraText_(r.accountId)===accountId;})[0]||null;
  if(!existing)throw new Error('NO PIPELINE RECORD FOR ACCOUNT -- run opportunity/pipeline sync before creating a handoff');
  return v6UpsertPipelineStage_({
    accountId:accountId,
    accountName:existing.accountName||'',
    amOwner:p.amOwner||existing.amOwner||'',
    opportunityType:existing.opportunityType||'',
    service:existing.service||'',
    campaignId:existing.campaignId||'',
    executionId:existing.executionId||'',
    currentStage:existing.currentStage||'',
    nextAction:'AM HANDOFF: '+(v6AuraText_(p.reason)||'UNSPECIFIED'),
    handoffStatus:'PENDING'
  });
}
